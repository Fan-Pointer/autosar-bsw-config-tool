import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConfigStore } from '../src/stores/configStore';

/**
 * QA 独立验收 C1：新建/克隆模块配置必须自动并入工程。
 *
 * 模型底线（产品口径）：**模块配置必须且只能属于一个工程**，不允许产生孤儿配置集。
 * 本文件只断言外部可观察行为（setUuids / moduleShortNames / 工程索引落盘），
 * 不依赖 attachSetToProject 的内部实现，实现改写后仍应成立。
 */

const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => db.data.get(key) ?? null,
      setItem: db.write,
    }),
  },
}));

/** 孤儿配置集：不属于任何工程的模块配置（模型禁止）。 */
function orphanSets(store: ReturnType<typeof useConfigStore>): string[] {
  const owned = new Set(store.projects.flatMap((project) => project.setUuids));
  return store.configSets
    .filter((set) => !owned.has(set.uuid))
    .map((set) => set.name ?? set.uuid);
}

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

describe('C1 新建/克隆模块配置自动并入工程', () => {
  // 已知缺陷锁（QA 2026-11-11）：**已有工程时**新建/克隆配置不会并入当前工程，而是另建一个
  // 「<模块> 工程」并把用户切走。根因不在 attachSetToProject 内部，而在它拿到的 `activeProject`：
  //   ① createConfigSet 先 createConfig()，把 activeUuid 切到**尚无归属**的新配置集；
  //   ② activeProject 在 activeProjectUuid 为空时会「按当前配置集的归属反查」兜底，
  //      新集没有归属 → 反查失败 → activeProject 变成 undefined；
  //   ③ createProject 从不显式写 activeProjectUuid（全仓只有 openProject / attach / switchConfigSet 写），
  //      所以「刚建完工程」也走这条兜底路径，一建新集就丢工程。
  // 修复方向：createProject 末尾显式 `activeProjectUuid.value = project.projectUuid`（与
  // 「显式工程状态」的意图一致），并在 createConfigSet/cloneConfigSet 里**先捕获**原工程再挂载，
  // 不要依赖「新集是 active」这一瞬时状态。
  // 无工程时自动建工程的那条路径是正确的（下方两条普通用例守护它）。
  it('有当前工程时：新 uuid 进 setUuids，moduleShortNames 去重加入，且不新建工程', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(
      await store.createProject({
        name: '既有工程',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    const projectUuid = store.activeProject!.projectUuid;
    const setsBefore = store.activeProject!.setUuids.length;
    const modulesBefore = [...store.activeProject!.moduleShortNames];
    expect(modulesBefore).toEqual(['Dem']);

    expect(await store.createConfigSet('第二个 Dem 配置', 'Dem', '4.4.0')).toBe(true);
    const created = store.configSets.find((set) => set.name === '第二个 Dem 配置')!;
    expect(created).toBeTruthy();

    const project = store.activeProject!;
    // ① 新 uuid 真的写进了 setUuids（且归属仍是同一个工程，没有另建工程）。
    expect(project.projectUuid).toBe(projectUuid);
    expect(project.setUuids).toContain(created.uuid);
    expect(project.setUuids).toHaveLength(setsBefore + 1);
    expect(store.projects).toHaveLength(1);
    // ② moduleShortNames 去重：同一模块不重复出现。
    expect(project.moduleShortNames).toEqual(['Dem']);
    expect(project.moduleShortNames.filter((name) => name === 'Dem')).toHaveLength(1);
    // ③ 模型底线：没有孤儿。
    expect(orphanSets(store)).toEqual([]);
  });

  it('无当前工程时：自动建工程并挂载，绝不留下孤儿配置集', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(store.activeProject).toBeUndefined();
    await store.ensureModuleDefinition('Dem', '4.4.0');

    expect(await store.createConfigSet('首次使用', 'Dem', '4.4.0')).toBe(true);
    const created = store.configSets.find((set) => set.name === '首次使用')!;

    // ① 自动建出了工程，且配置集真的被挂上去。
    expect(store.projects).toHaveLength(1);
    const project = store.projects[0]!;
    expect(project.setUuids).toEqual([created.uuid]);
    expect(project.moduleShortNames).toEqual(['Dem']);
    expect(store.activeProject?.projectUuid).toBe(project.projectUuid);
    // ② 模型底线：无孤儿（这条是本改动的核心目的）。
    expect(orphanSets(store)).toEqual([]);
    // ③ 自动建的工程必须自洽：版本跟随配置集，芯片有默认值且留痕。
    expect(project.autosarVersion).toBe('4.4.0');
    expect(project.chip.family).toBe('S32K1XX');
    expect(project.chip.note).toBeTruthy();
  });

  it('连续新建多个模块配置：工程关联幂等，不出现重复 uuid（同 D1 缺陷：丢失当前工程）', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(
      await store.createProject({
        name: '多配置工程',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    expect(await store.createConfigSet('A', 'Dem', '4.4.0')).toBe(true);
    expect(await store.createConfigSet('B', 'Dem', '4.4.0')).toBe(true);

    const project = store.activeProject!;
    expect(project.setUuids).toHaveLength(3);
    expect(new Set(project.setUuids).size).toBe(3);
    expect(project.moduleShortNames).toEqual(['Dem']);
    expect(orphanSets(store)).toEqual([]);
  });

  it('克隆模块配置同样并入工程（同 D1 缺陷：丢失当前工程）', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(
      await store.createProject({
        name: '克隆工程',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    const source = store.activeProject!.setUuids[0]!;
    const before = store.activeProject!.setUuids.length;

    expect(await store.cloneConfigSet(source)).toBe(true);
    const project = store.activeProject!;
    expect(project.setUuids).toHaveLength(before + 1);
    expect(new Set(project.setUuids).size).toBe(before + 1);
    expect(project.moduleShortNames).toEqual(['Dem']);
    expect(orphanSets(store)).toEqual([]);
  });

  it('工程关联真正落盘：重载后新配置仍属于该工程（不是只改内存）', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.ensureModuleDefinition('Dem', '4.4.0');
    expect(await store.createConfigSet('落盘验证', 'Dem', '4.4.0')).toBe(true);
    const projectUuid = store.projects[0]!.projectUuid;
    const setUuid = store.configSets.find((set) => set.name === '落盘验证')!.uuid;

    // 重载 = 从存储重建 store（模拟刷新页面）。
    setActivePinia(createPinia());
    const reloaded = useConfigStore();
    await reloaded.initialize();
    const project = reloaded.projects.find((item) => item.projectUuid === projectUuid)!;
    expect(project).toBeTruthy();
    expect(project.setUuids).toContain(setUuid);
    expect(orphanSets(reloaded)).toEqual([]);
  });
});
