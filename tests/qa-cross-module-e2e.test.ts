import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { buildProjectReferenceScope } from '../src/core/config/ProjectReferenceScope';
import {
  collectProjectContainerPaths,
  exportProjectArxml,
  importArxml,
} from '../src/core/io/Arxml';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';
import { useConfigStore } from '../src/stores/configStore';

/**
 * QA 端到端验证：真实 store + 真实持久层（localforage 以内存 mock 顶替磁盘），
 * 只构造定义与配置，不 mock 任何被测核心逻辑。
 * 目标是确认「可选 → 可选 → 可校验 → 可导出 → 移出工程后失效」这一整条链路自洽。
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

const A_ROOT = '/AUTOSAR/EcucDefs/SupplierA/ARoot';

/** 最小容器定义。 */
function containerDef(
  uuid: string,
  shortName: string,
  definitionPath: string,
  references: BswmdContainer['references'] = []
): BswmdContainer {
  return {
    uuid,
    shortName,
    definitionPath,
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references,
    subContainers: [],
  };
}

/** A 模块：只提供一个可被引用的容器。 */
const moduleA: BswmdModule = {
  shortName: 'SupplierA',
  version: '4.4.0',
  containers: [containerDef('def.a.root', 'ARoot', A_ROOT)],
};

/** B 模块：一条必填的跨模块引用，目标声明指向 A 的 ARoot。 */
const moduleB: BswmdModule = {
  shortName: 'SupplierB',
  version: '4.4.0',
  containers: [
    containerDef('def.b.root', 'BRoot', '/AUTOSAR/EcucDefs/SupplierB/BRoot', [
      {
        uuid: 'def.b.ref',
        shortName: 'BRootRef',
        kind: 'foreign',
        isExternal: true,
        isOptional: false,
        destinationRef: A_ROOT,
        destinationContainerType: 'ARoot',
      },
    ]),
  ],
};

/** 建库 + 建工程（A、B 两个模块配置）。 */
async function projectWithTwoModules(): Promise<ReturnType<typeof useConfigStore>> {
  const store = useConfigStore();
  await store.initialize();
  await store.importModuleDefinitions([moduleA, moduleB]);
  expect(
    await store.createProject({
      name: 'QA 跨模块工程',
      autosarVersion: '4.4.0',
      chip: { family: 'S32K3XX' },
      moduleShortNames: ['SupplierA', 'SupplierB'],
    })
  ).toBe(true);
  return store;
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

describe('跨模块引用端到端（store 真实链路）', () => {
  it('候选可列出 → 写入即通过校验 → 工程 ARXML 写出 /Config 路径 → 移出工程后转为悬空', async () => {
    const store = await projectWithTwoModules();
    const setA = store.configSets.find((set) => set.moduleRef === 'SupplierA')!;
    const setB = store.configSets.find((set) => set.moduleRef === 'SupplierB')!;
    expect(setA).toBeTruthy();
    expect(setB).toBeTruthy();
    // 工程内两个模块配置都已归属本工程。
    expect(store.activeProject!.setUuids).toEqual(expect.arrayContaining([setA.uuid, setB.uuid]));

    // 切到 B 的模块配置，选中含引用的根容器。
    expect(await store.switchConfigSet(setB.uuid)).toBe(true);
    const targetUuid = store.projectScope()!.byDefinitionPath.get(A_ROOT)![0]!.uuid;
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    expect(entryB).toBeTruthy();
    store.selectContainer(entryB.container.uuid);

    // 1) 候选可列出，且标签带「A › 」模块前缀。
    const options = store.referenceOptions['def.b.ref'];
    expect(options).toEqual([
      expect.objectContaining({ uuid: targetUuid, label: 'SupplierA › ARoot', module: 'SupplierA' }),
    ]);
    expect(options![0]!.label).toContain('SupplierA › ');

    // 负向对照：写入目标之前，闸门必须真的看到这条引用并报 REQUIRED。
    // 否则下面的「不再报错」可能只是闸门根本没走到该引用（空洞通过）。
    expect(
      store.getOutputCheck().issues.filter((issue) => issue.ruleId === 'OUTPUT-EXTERNAL-REQUIRED')
    ).toHaveLength(1);

    // 2) 写入目标后，闸门不再报任何 OUTPUT-EXTERNAL-* 的 ERROR。
    store.setReferenceTarget('def.b.ref', targetUuid);
    const check = store.getOutputCheck();
    expect(check.issues.filter((issue) => issue.ruleId.startsWith('OUTPUT-EXTERNAL-'))).toEqual([]);
    expect(check.ready).toBe(true);

    // 3) 工程级导出把该引用写成绝对 /Config/A/... 路径。
    const xml = store.exportProjectArxmlContent();
    expect(xml).toContain(
      `<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/Config/SupplierA/ARoot</VALUE-REF>`
    );

    // 4) 把 A 从工程移除 → 同一引用立即变为悬空（目标不再属于当前工程）。
    expect(await store.updateProjectModules(store.activeProject!.projectUuid, ['SupplierB'])).toBe(
      true
    );
    const detached = store.getOutputCheck();
    const external = detached.issues.filter((issue) => issue.ruleId.startsWith('OUTPUT-EXTERNAL-'));
    expect(external).toHaveLength(1);
    expect(external[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-DANGLING',
    });
    expect(detached.ready).toBe(false);
    // 候选随之清空：不可能再从「已经不在工程里」的模块挑目标。
    expect(store.referenceOptions['def.b.ref']).toEqual([]);
  });

  it('没有工程上下文时（无 activeProject）候选恒为空且引用无法落库', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.importModuleDefinitions([moduleA, moduleB]);
    // 不建工程，直接建一个游离的模块配置。
    expect(await store.createConfigSet('孤立 B', 'SupplierB', '4.4.0')).toBe(true);
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    store.selectContainer(entryB.container.uuid);
    expect(store.activeProject).toBeUndefined();
    expect(store.projectScope()).toBeUndefined();
    expect(store.referenceOptions['def.b.ref']).toEqual([]);
    // 写入一个「别的工程的」目标必须被拒绝，绝不静默接受。
    expect(() => store.setReferenceTarget('def.b.ref', 'uuid.from.another.project')).toThrow(
      '引用目标不在当前工程内'
    );
    // 未选目标的必填跨模块引用仍然报 ERROR（不因无工程上下文而放宽）。
    expect(
      store.getOutputCheck().issues.filter((issue) => issue.ruleId === 'OUTPUT-EXTERNAL-REQUIRED')
    ).toHaveLength(1);
  });

  it('复制工程后跨模块引用指向副本自己的容器（不残留原工程 uuid）', async () => {
    const store = await projectWithTwoModules();
    const setB = store.configSets.find((set) => set.moduleRef === 'SupplierB')!;
    expect(await store.switchConfigSet(setB.uuid)).toBe(true);
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    store.selectContainer(entryB.container.uuid);
    const originalTarget = store.projectScope()!.byDefinitionPath.get(A_ROOT)![0]!.uuid;
    store.setReferenceTarget('def.b.ref', originalTarget);
    expect(await store.saveConfig()).toBe(true);

    const copyUuid = await store.duplicateProject(store.activeProject!.projectUuid);
    const copy = store.projects.find((project) => project.projectUuid === copyUuid)!;
    const copySetB = store.configSets.find(
      (set) => copy.setUuids.includes(set.uuid) && set.moduleRef === 'SupplierB'
    )!;
    const copyEntryB = copySetB.containers.find(
      (container) => (container.references.get('def.b.ref')?.targetUuid ?? '') !== ''
    )!;
    const rewritten = copyEntryB.references.get('def.b.ref')!.targetUuid;
    expect(rewritten).not.toBe(originalTarget);
    // 新目标必须是副本自己的 A 容器，这样副本的引用不会悬空。
    expect(store.getOutputCheck(copySetB, moduleB).ready).toBe(true);
  });

  // 回归哨兵（QA 发现、工程师修复 2026-11-11）：duplicateProject 早期实现在单个 .map 内
  // 逐集合「先改名、再改写引用」，只有当目标集合排在引用集合之前时才生效；
  // 顺序反转（引用方在前）时副本内的跨模块引用仍指向原工程的 uuid → 副本必然悬空。
  // 现实现分两遍遍历（先全量改名填满 uuidMap，再统一 remap），本用例锁定该修复。
  it('复制工程：跨模块引用的改写与模块顺序无关', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.importModuleDefinitions([moduleA, moduleB]);
    // 关键差异：先建 B 的配置集、后建 A 的配置集，使 B 在 configSets 中排在 A 之前。
    expect(
      await store.createProject({
        name: '顺序工程',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['SupplierB', 'SupplierA'],
      })
    ).toBe(true);
    expect(store.configSets.map((set) => set.moduleRef)).toEqual(['SupplierB', 'SupplierA']);

    const setB = store.configSets.find((set) => set.moduleRef === 'SupplierB')!;
    expect(await store.switchConfigSet(setB.uuid)).toBe(true);
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    store.selectContainer(entryB.container.uuid);
    const originalTarget = store.projectScope()!.byDefinitionPath.get(A_ROOT)![0]!.uuid;
    store.setReferenceTarget('def.b.ref', originalTarget);
    expect(await store.saveConfig()).toBe(true);

    const copyUuid = await store.duplicateProject(store.activeProject!.projectUuid);
    const copy = store.projects.find((project) => project.projectUuid === copyUuid)!;
    const copySetB = store.configSets.find(
      (set) => copy.setUuids.includes(set.uuid) && set.moduleRef === 'SupplierB'
    )!;
    const copySetA = store.configSets.find(
      (set) => copy.setUuids.includes(set.uuid) && set.moduleRef === 'SupplierA'
    )!;
    const copyTargets = new Set(copySetA.containers.map((container) => container.uuid));
    const rewritten = [...copySetB.containers]
      .map((container) => container.references.get('def.b.ref')?.targetUuid ?? '')
      .find((uuid) => uuid !== '');
    expect(rewritten).toBeDefined();
    // 必须已改写：不得再指向原工程 A 容器的 uuid。
    expect(rewritten).not.toBe(originalTarget);
    // 且必须落在副本自己的 A 容器里（与模块排列顺序无关）。
    expect(copyTargets.has(rewritten!)).toBe(true);

    // 复制不得反向污染源工程：原工程的引用目标仍是原来的 A 容器。
    const sourceSetB = store.configSets.find((set) => set.uuid === setB.uuid)!;
    const sourceRef = [...sourceSetB.containers]
      .map((container) => container.references.get('def.b.ref')?.targetUuid ?? '')
      .find((uuid) => uuid !== '');
    expect(sourceRef).toBe(originalTarget);

    // 副本自身也必须能导出（打开副本后再导出，验证的是副本而非源工程）。
    expect(await store.openProject(copyUuid)).toBe(true);
    const copyXml = store.exportProjectArxmlContent();
    expect(copyXml).toContain(
      `<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/Config/SupplierA/ARoot</VALUE-REF>`
    );
    // 副本导出的是一份自洽文档：两个模块段都在。
    expect((copyXml.match(/<ECUC-MODULE-CONFIGURATION-VALUES /g) ?? []).length).toBe(2);
    expect(copyXml).not.toContain('渲染失败');
  });

  it('单模块工程导出 → 再导入可还原（验证空段落美化修复，不含跨模块引用）', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.importModuleDefinitions([moduleA]);
    expect(
      await store.createProject({
        name: '单模块工程',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['SupplierA'],
      })
    ).toBe(true);
    const xml = store.exportProjectArxmlContent();
    // 空段落必须是 <X></X> 单行形态，不能被 prettyXml 拆成两行（否则导入端判成坏类型）。
    expect(xml).toContain('<SUB-CONTAINERS></SUB-CONTAINERS>');

    const scanned = store.scanArxmlImport(xml, null, true);
    const notes = await store.importArxmlModules(
      xml,
      scanned.map((item) => ({ shortName: item.shortName, mode: 'overwrite' as const })),
      { newProjectName: '单模块往返' }
    );
    expect(notes.join(' | ')).not.toContain('解析失败');
    const project = store.projects.find((item) => item.name === '单模块往返')!;
    expect(project).toBeTruthy();
    expect(project.setUuids).toHaveLength(1);
    const restored = store.configSets.find((set) => project.setUuids.includes(set.uuid))!;
    expect(restored.containers.length).toBeGreaterThan(0);
  });

  // 回归哨兵（QA 发现、工程师修复 2026-11-11）：工程导出→工程级再导入在「含跨模块引用」时曾丢模块。
  // 原根因：importArxml 只按本模块段建 targets 路径表，跨模块 VALUE-REF 抛「引用目标未包含在文件中」，
  // importArxmlModules 捕获后 continue → 模块被静默丢弃（只留一条 note）。
  // 现实现：importArxml 新增第 5 参 externalTargets（整篇文档「容器路径→uuid」索引），
  // importArxmlModules 导入前建一次该索引并传入；单模块导入不传该参数，语义不变（仍明确报错）。
  it('工程级导出 → 工程级再导入：含跨模块引用时不应丢模块', async () => {
    const store = await projectWithTwoModules();
    const setB = store.configSets.find((set) => set.moduleRef === 'SupplierB')!;
    expect(await store.switchConfigSet(setB.uuid)).toBe(true);
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    store.selectContainer(entryB.container.uuid);
    store.setReferenceTarget('def.b.ref', store.projectScope()!.byDefinitionPath.get(A_ROOT)![0]!.uuid);
    expect(await store.saveConfig()).toBe(true);

    // 导出口
    const xml = store.exportProjectArxmlContent();
    expect(xml).toContain('/Config/SupplierA/ARoot');

    // 导入口（工程级）：勾选两个模块、新建工程
    const scanned = store.scanArxmlImport(xml, null, true);
    expect(scanned.map((item) => item.shortName).sort()).toEqual(['SupplierA', 'SupplierB']);
    const notes = await store.importArxmlModules(
      xml,
      scanned.map((item) => ({ shortName: item.shortName, mode: 'overwrite' as const })),
      { newProjectName: '往返工程' }
    );

    const roundTrip = store.projects.find((project) => project.name === '往返工程')!;
    expect(roundTrip).toBeTruthy();
    // 不得再出现「解析失败」：两个模块都必须还原。
    expect(notes.join(' | ')).not.toContain('解析失败');
    expect(roundTrip.setUuids).toHaveLength(2);
    const rtSetB = store.configSets.find(
      (set) => roundTrip.setUuids.includes(set.uuid) && set.moduleRef === 'SupplierB'
    )!;
    // 引用的目标必须落在**往返工程自己的** A 容器里（否则只是没报错、实际仍悬空）。
    const rtSetA = store.configSets.find(
      (set) => roundTrip.setUuids.includes(set.uuid) && set.moduleRef === 'SupplierA'
    )!;
    const rtAContainers = new Set(rtSetA.containers.map((container) => container.uuid));
    const rtTarget = [...rtSetB.containers]
      .map((container) => container.references.get('def.b.ref')?.targetUuid ?? '')
      .find((uuid) => uuid !== '')!;
    expect(rtAContainers.has(rtTarget)).toBe(true);
    const check = store.getOutputCheck(rtSetB, moduleB);
    expect(check.issues.filter((issue) => issue.ruleId.startsWith('OUTPUT-EXTERNAL-'))).toEqual([]);
    expect(check.ready).toBe(true);
  });

  it('部分导入（只勾 B 不勾 A）：引用应表现为可诊断的悬空，而不是静默通过', async () => {
    const store = await projectWithTwoModules();
    const setB = store.configSets.find((set) => set.moduleRef === 'SupplierB')!;
    expect(await store.switchConfigSet(setB.uuid)).toBe(true);
    const entryB = store.entries.find((entry) => entry.definition.references.length > 0)!;
    store.selectContainer(entryB.container.uuid);
    store.setReferenceTarget('def.b.ref', store.projectScope()!.byDefinitionPath.get(A_ROOT)![0]!.uuid);
    expect(await store.saveConfig()).toBe(true);
    const xml = store.exportProjectArxmlContent();

    // 用户只勾选 SupplierB：文档里仍有 A 的路径，B 自身能解析（不会「解析失败」），
    // 但 A 不会进入新工程 —— 结果必须能被诊断成 DANGLING，而不是静默可用。
    const notes = await store.importArxmlModules(
      xml,
      [{ shortName: 'SupplierB', mode: 'overwrite' }],
      { newProjectName: '只导B' }
    );
    expect(notes.join(' | ')).not.toContain('解析失败');
    const project = store.projects.find((item) => item.name === '只导B')!;
    expect(project).toBeTruthy();
    expect(project.setUuids).toHaveLength(1);

    const importedB = store.configSets.find((set) => project.setUuids.includes(set.uuid))!;
    const check = store.getOutputCheck(importedB, moduleB);
    const dangling = check.issues.filter((issue) => issue.ruleId === 'OUTPUT-EXTERNAL-DANGLING');
    expect(dangling).toHaveLength(1);
    expect(dangling[0]).toMatchObject({ severity: 'ERROR' });
    expect(check.ready).toBe(false);
  });

  it('多值跨模块引用：工程导出→再导入后多个目标仍全部可解析', () => {
    // A 有两个**不同短名**的根容器，各自实例路径唯一（同名根会撞路径，不是真实结构）。
    const A_EXTRA = '/AUTOSAR/EcucDefs/SupplierA/AExtra';
    const extraDef: BswmdContainer = {
      uuid: 'def.a.extra',
      shortName: 'AExtra',
      definitionPath: A_EXTRA,
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [],
    };
    const rootA: BswmdContainer = {
      uuid: 'def.a.root',
      shortName: 'ARoot',
      definitionPath: A_ROOT,
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [],
    };
    const moduleA2: BswmdModule = {
      shortName: 'SupplierA',
      version: '4.4.0',
      containers: [rootA, extraDef],
    };
    const multiRef = {
      uuid: 'def.b.ref',
      shortName: 'BRootRef',
      kind: 'foreign' as const,
      isExternal: true,
      isOptional: false,
      destinationRef: A_ROOT,
      destinationRefs: [A_ROOT, A_EXTRA],
      destinationContainerType: 'ARoot',
      multiplicity: { lower: 0, upper: 'unbounded' as const },
    };
    const rootB: BswmdContainer = {
      uuid: 'def.b.root',
      shortName: 'BRoot',
      definitionPath: '/AUTOSAR/EcucDefs/SupplierB/BRoot',
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [multiRef],
      subContainers: [],
    };
    const moduleB2: BswmdModule = { shortName: 'SupplierB', version: '4.4.0', containers: [rootB] };

    const manager = new ConfigInstanceManager([moduleA2, moduleB2]);
    const configA = manager.createFromBswmd(moduleA2);
    const configB = manager.createFromBswmd(moduleB2);
    const aRoot = configA.containers.find((item) => item.shortName === 'ARoot')!;
    const aExtra = configA.containers.find((item) => item.shortName === 'AExtra')!;
    expect(aRoot && aExtra).toBeTruthy();
    manager.addReferenceTarget(configB.containers[0]!, 'def.b.ref', aRoot.uuid);
    manager.addReferenceTarget(configB.containers[0]!, 'def.b.ref', aExtra.uuid);

    const entries = [
      { config: configA, module: moduleA2 },
      { config: configB, module: moduleB2 },
    ];
    // 两个合法目标（路径都在 destinationRefs 内）→ 校验无问题。
    expect(
      evaluateOutputReadiness(configB, moduleB2, [], buildProjectReferenceScope(entries)).issues
    ).toEqual([]);

    const xml = exportProjectArxml(entries);
    const valueRef = /<VALUE-REF DEST="ECUC-CONTAINER-VALUE">\/Config\/SupplierA\/[^<]+<\/VALUE-REF>/g;
    expect(xml.match(valueRef) ?? []).toEqual([
      '<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/Config/SupplierA/ARoot</VALUE-REF>',
      '<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/Config/SupplierA/AExtra</VALUE-REF>',
    ]);

    // 工程级再导入：多值目标必须按文件全部还原（不能只剩一个或变成空串）。
    const importedB = importArxml(
      xml,
      [moduleA2, moduleB2],
      undefined,
      'SupplierB',
      collectProjectContainerPaths(xml)
    );
    const restored = importedB.containers[0]!.references.get('def.b.ref')!;
    expect(restored.targetUuids).toEqual([aRoot.uuid, aExtra.uuid]);
  });

  // 回归哨兵（QA 发现、工程师修复 2026-11-11）：externalTargets 索引早期只收**根容器**。
  // 原根因：collectProjectContainerPaths 的 walk 直接对节点递归找 ECUC-CONTAINER-VALUE，
  // 但解析树里嵌套容器在 SUB-CONTAINERS 下 → `/Config/A/ARoot/AChild` 从未被索引 →
  // 工程级再导入抛「引用目标未包含在文件中」→ 整模块被跳过。
  // 现实现：walk 改为遍历节点的 SUB-CONTAINERS（与 importArxml 的 visit 完全一致）。
  it('跨模块引用指向嵌套容器（/Config/A/ARoot/AChild）时，工程往返不应丢模块', () => {
    const A_CHILD = '/AUTOSAR/EcucDefs/SupplierA/ARoot/AChild';
    const A_GRAND = '/AUTOSAR/EcucDefs/SupplierA/ARoot/AChild/AGrandChild';
    // 二级嵌套：只有递归遍历 SUB-CONTAINERS 才能索引到，专治「只索引根容器」这一类缺陷。
    const grandChildDef: BswmdContainer = {
      uuid: 'def.a.grand',
      shortName: 'AGrandChild',
      definitionPath: A_GRAND,
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [],
    };
    const childDef: BswmdContainer = {
      uuid: 'def.a.child',
      shortName: 'AChild',
      definitionPath: A_CHILD,
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [grandChildDef],
    };
    const rootA: BswmdContainer = {
      uuid: 'def.a.root',
      shortName: 'ARoot',
      definitionPath: A_ROOT,
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [childDef],
    };
    const moduleA3: BswmdModule = { shortName: 'SupplierA', version: '4.4.0', containers: [rootA] };
    const nestedRef = {
      uuid: 'def.b.ref',
      shortName: 'BChildRef',
      kind: 'foreign' as const,
      isExternal: true,
      isOptional: false,
      destinationRef: A_CHILD,
      destinationContainerType: 'AChild',
    };
    const deepRef = {
      uuid: 'def.b.deep',
      shortName: 'BGrandRef',
      kind: 'foreign' as const,
      isExternal: true,
      isOptional: false,
      destinationRef: A_GRAND,
      destinationContainerType: 'AGrandChild',
    };
    const rootB: BswmdContainer = {
      uuid: 'def.b.root',
      shortName: 'BRoot',
      definitionPath: '/AUTOSAR/EcucDefs/SupplierB/BRoot',
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [nestedRef, deepRef],
      subContainers: [],
    };
    const moduleB3: BswmdModule = { shortName: 'SupplierB', version: '4.4.0', containers: [rootB] };

    const manager = new ConfigInstanceManager([moduleA3, moduleB3]);
    const configA = manager.createFromBswmd(moduleA3);
    const configB = manager.createFromBswmd(moduleB3);
    const child = configA.containers[0]!.subContainers[0]!;
    const grandChild = child.subContainers[0]!;
    expect(grandChild).toBeTruthy();
    manager.setReferenceTarget(configB.containers[0]!, 'def.b.ref', child.uuid);
    manager.setReferenceTarget(configB.containers[0]!, 'def.b.deep', grandChild.uuid);

    const entries = [
      { config: configA, module: moduleA3 },
      { config: configB, module: moduleB3 },
    ];
    const xml = exportProjectArxml(entries);
    // 导出侧是正确的：写的是嵌套绝对路径（一级 + 二级）。
    expect(xml).toContain('>/Config/SupplierA/ARoot/AChild</VALUE-REF>');
    expect(xml).toContain('>/Config/SupplierA/ARoot/AChild/AGrandChild</VALUE-REF>');

    // 工程级再导入必须能解析两种深度的嵌套目标。
    const importedB = importArxml(
      xml,
      [moduleA3, moduleB3],
      undefined,
      'SupplierB',
      collectProjectContainerPaths(xml)
    );
    expect(importedB.containers[0]!.references.get('def.b.ref')!.targetUuid).toBe(child.uuid);
    expect(importedB.containers[0]!.references.get('def.b.deep')!.targetUuid).toBe(grandChild.uuid);
  });
});
