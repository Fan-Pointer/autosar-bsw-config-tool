import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConfigStore } from '../src/stores/configStore';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { moduleKey } from '../src/core/bswmd/ModuleKey';
import type { ProjectInput } from '../src/stores/projectMetadata';

const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => db.data.get(key) ?? null,
      setItem: db.write,
    }),
  },
}));
const input: ProjectInput = {
  name: '车身控制器',
  description: '台架阶段',
  autosarVersion: '4.4.0',
  chip: { family: 'S32K3XX', note: '台架验证' },
  moduleShortNames: ['Dem', 'CanIf'],
};
beforeEach(() => {
  db.data.clear();
  db.write.mockReset();
  db.write.mockImplementation(async (key: string, value: unknown) => {
    db.data.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('G40 project management', () => {
  it('edits name/description/chip, keeps the AUTOSAR version and renames derived set names', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(await store.createProject(input)).toBe(true);
    const project = store.activeProject!;
    const setNamesBefore = store.configSets
      .filter((set) => project.setUuids.includes(set.uuid))
      .map((set) => set.name);

    await store.updateProject(project.projectUuid, {
      name: '车身控制器 v2',
      description: '第二轮台架',
      chip: { family: 'S32K1XX', note: '台架验证' },
    });
    const updated = store.projects.find((item) => item.projectUuid === project.projectUuid)!;
    expect(updated.name).toBe('车身控制器 v2');
    expect(updated.description).toBe('第二轮台架');
    expect(updated.chip.family).toBe('S32K1XX');
    // AUTOSAR 版本不可改（方法不接受该字段，值保持不变）。
    expect(updated.autosarVersion).toBe('4.4.0');
    expect(updated.updatedAt).toBeTruthy();
    const renamed = store.configSets
      .filter((set) => project.setUuids.includes(set.uuid))
      .map((set) => set.name);
    expect(renamed).toEqual(
      setNamesBefore.map((name) => name!.replace('车身控制器 · ', '车身控制器 v2 · '))
    );
  });

  it('rejects an over-long description and an empty name', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.createProject(input);
    const project = store.activeProject!;
    await expect(
      store.updateProject(project.projectUuid, { description: 'x'.repeat(101) })
    ).rejects.toThrow('100');
    await expect(store.updateProject(project.projectUuid, { name: '   ' })).rejects.toThrow(
      '请输入工程名称'
    );
  });

  it('validates every project and closes all without deleting data (FR-33)', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.createProject(input);
    const rows = store.validateAllProjects();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('车身控制器');
    expect(rows[0].total).toBe(2);
    // 每个配置集都进入统计，失败数与失败明细条数一致。
    expect(rows[0].ready + rows[0].errorCount).toBe(2);
    expect(rows[0].failures).toHaveLength(rows[0].errorCount);
    const activeBefore = store.activeUuid;
    const setCount = store.configSets.length;
    store.closeAllProjects();
    expect(store.activeUuid).toBeUndefined();
    expect(store.config).toBeNull();
    // 关闭只清编辑上下文，库中配置集一个不少。
    expect(store.configSets).toHaveLength(setCount);
    expect(store.configSets.some((set) => set.uuid === activeBefore)).toBe(true);
  });

  it('duplicates a project with its configuration data and independent identities', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.createProject(input);
    const source = store.activeProject!;
    const sourceSetUuids = [...source.setUuids];
    const sourceContainerUuid = store.configSets.find((set) => set.uuid === sourceSetUuids[0])!
      .containers[0].uuid;

    const copyUuid = await store.duplicateProject(source.projectUuid);
    const copy = store.projects.find((item) => item.projectUuid === copyUuid)!;
    expect(copy.name).toBe('车身控制器 副本');
    expect(copy.autosarVersion).toBe('4.4.0');
    expect(copy.moduleShortNames).toEqual(source.moduleShortNames);
    expect(copy.setUuids).toHaveLength(sourceSetUuids.length);
    expect(copy.setUuids.some((uuid) => sourceSetUuids.includes(uuid))).toBe(false);
    const copySets = store.configSets.filter((set) => copy.setUuids.includes(set.uuid));
    expect(copySets.length).toBe(sourceSetUuids.length);
    expect(copySets.every((set) => set.name?.startsWith('车身控制器 副本 ·'))).toBe(true);
    // 容器实例 UUID 重生成，两个工程的选择/导航目标互不干扰。
    expect(copySets[0].containers[0].uuid).not.toBe(sourceContainerUuid);
    // 原工程未被改动。
    expect(store.projects.filter((item) => item.name === '车身控制器')).toHaveLength(1);
    expect(store.configSets.filter((set) => sourceSetUuids.includes(set.uuid))).toHaveLength(
      sourceSetUuids.length
    );
  });

  it('rewrites reference targets onto the copied containers so the duplicate never dangles', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.createProject({ ...input, moduleShortNames: ['Dem'] });
    const source = store.activeProject!;
    const eventParameter = store.entries.find(
      (entry) => entry.definition.shortName === 'DemEventParameter'
    )!;
    const operationCycle = store.entries.find(
      (entry) => entry.definition.shortName === 'DemOperationCycle'
    )!;
    const refDefinition = eventParameter.definition.references.find(
      (reference) => reference.shortName === 'DemOperationCycleRef'
    )!;
    store.selectContainer(eventParameter.container.uuid);
    store.setReferenceTarget(refDefinition.uuid, operationCycle.container.uuid);
    expect(await store.saveConfig()).toBe(true);

    const copyUuid = await store.duplicateProject(source.projectUuid);
    const copy = store.projects.find((item) => item.projectUuid === copyUuid)!;
    const copySet = store.configSets.find((set) => copy.setUuids.includes(set.uuid))!;
    const definition = store.modules.find(
      (item) => item.shortName === copySet.moduleRef && item.version === copySet.version
    )!;
    const copyEntries = collectContainers(copySet, definition);
    const copyEvent = copyEntries.find(
      (entry) => entry.definition.shortName === 'DemEventParameter'
    )!;
    const copyCycle = copyEntries.find(
      (entry) => entry.definition.shortName === 'DemOperationCycle'
    )!;
    // 引用目标必须指向副本自己的容器，而不是原工程的 uuid（否则副本必然悬空）。
    expect(copyEvent.container.references.get(refDefinition.uuid)?.targetUuid).toBe(
      copyCycle.container.uuid
    );
    expect(copyCycle.container.uuid).not.toBe(operationCycle.container.uuid);
    // 副本必须是可编辑的真实结构：cloneData 的 JSON 深拷贝会把 references 拍平成对象。
    expect(copySet.containers.every((container) => container.references instanceof Map)).toBe(
      true
    );
  });

  it('blocks historical shared ownership without changing the active project or leaking reference scope', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(
      await store.createProject({
        name: 'DEMO1',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    expect(
      await store.createProject({
        name: 'DEMO2',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    const p1 = store.projects.find((item) => item.name === 'DEMO1')!;
    const p2 = store.projects.find((item) => item.name === 'DEMO2')!;
    // 模拟历史脏数据：两个工程共享同一份模块配置（DEMO2 额外引用了 DEMO1 的配置集）。
    store.projects = store.projects.map((item) =>
      item.projectUuid === p2.projectUuid
        ? { ...item, setUuids: [p1.setUuids[0], ...item.setUuids] }
        : item
    );
    const before = JSON.stringify([...db.data]);
    const activeBefore = store.activeUuid;
    // 唯一归属模型：不能把共享配置伪装成 DEMO2 的独立模块，更不能改名后继续编辑。
    expect(await store.openProject(p2.projectUuid)).toBe(false);
    expect(store.activeProject?.name).toBe('DEMO2');
    expect(store.activeUuid).toBe(activeBefore);
    expect(await store.openProject(p1.projectUuid)).toBe(false);
    expect(await store.switchConfigSet(p1.setUuids[0]!)).toBe(false);
    expect(store.projectScope()).toBeUndefined();
    expect(store.projectError).toContain('共享');
    expect(store.ownershipDiagnosis.shared[0]!.projects).toEqual(['DEMO1', 'DEMO2']);
    expect(JSON.stringify([...db.data])).toBe(before);
  });

  // C1：新建模块配置必须归属工程（否则工程树看不到、跨模块候选为空、导出报 NO-SCOPE）。
  it('attaches a newly created module config to the current project and stays idempotent', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(await store.createProject(input)).toBe(true);
    const project = store.activeProject!;
    // 用户先把 Dem 的「生成」关掉：新建配置不得把这个开关重置回 true。
    store.modulePreferences[moduleKey('Dem', '4.4.0')] = {
      included: true,
      generation: false,
      validation: true,
    };

    expect(await store.createConfigSet('新增 Dem', 'Dem')).toBe(true);
    const created = store.config!;
    const attached = store.projects.find((item) => item.projectUuid === project.projectUuid)!;
    expect(attached.setUuids).toContain(created.uuid);
    expect(attached.moduleShortNames).toContain('Dem');
    // 候选来源：新配置的容器必须在工程作用域内（跨模块候选与导出都依赖这张表）。
    const scope = store.projectScope()!;
    expect(scope.containers.has(created.containers[0]!.uuid)).toBe(true);
    // 用户设过的开关不被覆盖。
    expect(store.modulePreferences[moduleKey('Dem', '4.4.0')]).toEqual({
      included: true,
      generation: false,
      validation: true,
    });
    // 幂等：同模块再加一条配置，moduleShortNames 不重复、setUuids 各自独立。
    expect(await store.createConfigSet('第二条 Dem', 'Dem')).toBe(true);
    const again = store.projects.find((item) => item.projectUuid === project.projectUuid)!;
    expect(again.moduleShortNames.filter((name) => name === 'Dem')).toHaveLength(1);
    expect(again.setUuids.filter((id) => id === created.uuid)).toHaveLength(1);
    expect(again.setUuids).toContain(store.config!.uuid);
  });

  it('creates a project instead of leaving an orphan when no project is open', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(store.activeProject).toBeUndefined();
    expect(await store.createConfigSet('首次使用', 'Dem')).toBe(true);
    const created = store.config!;
    // 策略：自动建一个以模块命名的工程并挂载（不产生孤儿配置）。
    expect(store.projects).toHaveLength(1);
    const auto = store.projects[0]!;
    expect(auto.name).toBe('Dem 工程');
    expect(auto.autosarVersion).toBe(created.version);
    expect(auto.setUuids).toEqual([created.uuid]);
    expect(auto.moduleShortNames).toEqual(['Dem']);
    expect(store.activeProject?.projectUuid).toBe(auto.projectUuid);
    // 无孤儿：库里每个配置都恰好属于一个工程。
    for (const set of store.configSets)
      expect(
        store.projects.filter((item) => item.setUuids.includes(set.uuid))
      ).toHaveLength(1);
  });

  it('detaches a deleted module config from its project so no dangling warning appears', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(await store.createProject({ ...input, moduleShortNames: ['Dem'] })).toBe(true);
    const project = store.activeProject!;
    const setUuid = project.setUuids[0]!;

    expect(await store.deleteConfigSet(setUuid)).toBe(true);
    const after = store.projects.find((item) => item.projectUuid === project.projectUuid)!;
    expect(after.setUuids).not.toContain(setUuid);
    // 该模块已无任何配置留在工程里，模块名也一并摘掉（否则工程树出现空模块）。
    expect(after.moduleShortNames).toEqual([]);
    // 关键：工程不再引用不存在的配置，不会触发「N 个模块配置暂不可用」的恢复告警。
    expect(store.projectWarnings).toEqual([]);
  });
});
