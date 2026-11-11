import { describe, expect, it } from 'vitest';
import type { BswmdContainer, BswmdModule, BswmdReference } from '../src/core/bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../src/core/config/ConfigTypes';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import {
  buildProjectReferenceScope,
  resolveExternalReferenceCandidates,
} from '../src/core/config/ProjectReferenceScope';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';
import { exportProjectArxml } from '../src/core/io/Arxml';

/**
 * QA 独立反向验证：只按产品口径断言，「跨模块引用」的 5 类判定必须逐条成立。
 * 刻意使用最小构造（不依赖 Dem/CanIf 等真实定义），避免实现细节掩盖规则表缺陷。
 */

const TARGET_PATH = '/AUTOSAR/EcucDefs/SupplierA/ARoot';
const OTHER_PATH = '/AUTOSAR/EcucDefs/SupplierA/AOther';

/** 工程内目标容器实例的 UUID（由供体模块提供）。 */
const IN_PROJECT_TARGET = 'instance.a.root';
/** 工程外（历史库/别的工程）残留的引用目标 UUID。 */
const OUT_OF_PROJECT_TARGET = 'instance.from.another.project';

/** 最小容器定义。 */
function containerDef(
  uuid: string,
  shortName: string,
  definitionPath: string
): BswmdContainer {
  return {
    uuid,
    shortName,
    definitionPath,
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references: [],
    subContainers: [],
  };
}

/** 最小容器实例。 */
function containerInstance(
  uuid: string,
  definitionRef: string,
  shortName: string
): ConfigContainer {
  return {
    uuid,
    definitionRef,
    shortName,
    parameters: new Map(),
    references: new Map(),
    subContainers: [],
  };
}

/** 最小模块配置。 */
function configOf(
  uuid: string,
  moduleRef: string,
  version: string,
  containers: ConfigContainer[]
): ConfigInstance {
  return {
    uuid,
    name: `${moduleRef} 配置`,
    moduleRef,
    version,
    containers,
    createdAt: 0,
    lastModified: 0,
  };
}

/** 被引用方（供体）模块：一个容器定义。 */
function donorModule(version = '4.4.0', definitionPath = TARGET_PATH): BswmdModule {
  return {
    shortName: 'SupplierA',
    version,
    containers: [containerDef('def.a.root', 'ARoot', definitionPath)],
  };
}

/** 被引用方（供体）配置。 */
function donorConfig(version = '4.4.0'): ConfigInstance {
  return configOf('cfg.a', 'SupplierA', version, [
    containerInstance(IN_PROJECT_TARGET, 'def.a.root', 'ARoot'),
  ]);
}

/** 引用定义；默认是一条必填的跨模块（FOREIGN）引用。 */
function externalRef(overrides: Partial<BswmdReference> = {}): BswmdReference {
  return {
    uuid: 'def.b.ref',
    shortName: 'BRootRef',
    kind: 'foreign',
    isExternal: true,
    isOptional: false,
    destinationRef: TARGET_PATH,
    destinationContainerType: 'ARoot',
    ...overrides,
  };
}

/** 引用方（宿主）模块：一个根容器 + 一条跨模块引用。 */
function hostModule(reference: BswmdReference): BswmdModule {
  const root = containerDef('def.b.root', 'BRoot', '/AUTOSAR/EcucDefs/SupplierB/BRoot');
  root.references = [reference];
  return { shortName: 'SupplierB', version: '4.4.0', containers: [root] };
}

/**
 * 构造宿主配置。
 * @param target 引用目标 UUID；空表示没有选择目标。
 * @param reference 引用定义（需与 hostModule 传入的同一个对象保持同一 uuid）。
 * @param configured false = 引用存在但从未被用户确认（未配置）。
 */
function hostConfig(
  target: string,
  reference: BswmdReference,
  configured = true
): ConfigInstance {
  const root = containerInstance('instance.b.root', 'def.b.root', 'BRoot');
  root.references.set(reference.uuid, {
    definitionRef: reference.uuid,
    targetUuid: target,
    isConfigured: configured,
  });
  return configOf('cfg.b', 'SupplierB', '4.4.0', [root]);
}

/** 只含 A、B 两个模块配置的工程作用域。 */
function scopeOf(donor: { config: ConfigInstance; module: BswmdModule } = {
  config: donorConfig(),
  module: donorModule(),
}) {
  return buildProjectReferenceScope([donor]);
}

describe('跨模块引用判定口径（QA 反向验证）', () => {
  it('构造自检：最小 fixture 真的会被闸门遍历到（防止空洞通过）', () => {
    const reference = externalRef();
    const collected = collectContainers(hostConfig(IN_PROJECT_TARGET, reference), hostModule(reference));
    expect(collected).toHaveLength(1);
    expect(collected[0]!.definition.references).toHaveLength(1);
    expect(collected[0]!.definition.references[0]!.isExternal).toBe(true);
    expect(scopeOf().containers.has(IN_PROJECT_TARGET)).toBe(true);
  });

  it('情形 1：必填未选 → ERROR / OUTPUT-EXTERNAL-REQUIRED', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig('', reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
    });
    expect(check.issues[0]?.reason).toContain('必填跨模块引用未选择目标');
  });

  it('情形 2：可选未选 → 通过（无 issue）', () => {
    const reference = externalRef({ isOptional: true });
    const check = evaluateOutputReadiness(
      hostConfig('', reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
  });

  it('情形 3：命中且路径匹配 → 通过（无 issue）', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
  });

  it('情形 3b：多候选引用命中第二候选路径 → 通过（无 issue）', () => {
    const reference = externalRef({
      kind: 'choice',
      destinationRef: OTHER_PATH,
      destinationRefs: [OTHER_PATH, TARGET_PATH],
    });
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
  });

  it('情形 4：命中但目标定义路径不匹配 → ERROR / OUTPUT-EXTERNAL-MISMATCH', () => {
    const reference = externalRef();
    // 目标容器在工程内，但它的定义路径是 AOther，而引用声明需要 ARoot。
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      scopeOf({ config: donorConfig(), module: donorModule('4.4.0', OTHER_PATH) })
    );
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-MISMATCH',
    });
    expect(check.issues[0]?.reason).toContain('跨模块引用目标类型不匹配');
  });

  it('情形 5：目标 uuid 不在 scope → ERROR / OUTPUT-EXTERNAL-DANGLING', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig(OUT_OF_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-DANGLING',
    });
    expect(check.issues[0]?.reason).toContain('跨模块引用目标不在当前工程内');
  });

  it('情形 6：已选但 scope 为 undefined → ERROR / OUTPUT-EXTERNAL-NO-SCOPE', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference)
      // 不给 scope：等价于「没有打开任何工程」。
    );
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-NO-SCOPE',
    });
    expect(check.issues[0]?.reason).toContain('跨模块引用需在工程上下文中导出');
  });

  it('情形 7：目标模块版本 ≠ 工程版本 → WARNING / VERSION-DRIFT 且仍可供导出', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      // 供体配置与它的定义一致（4.2.2），与宿主工程的 4.4.0 不同 → 漂移。
      scopeOf({ config: donorConfig('4.2.2'), module: donorModule('4.2.2') })
    );
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'WARNING',
      ruleId: 'OUTPUT-EXTERNAL-VERSION-DRIFT',
    });
    expect(check.issues[0]?.reason).toContain('版本与工程不一致');
    // 关键口径：漂移不阻塞导出。
    expect(check.ready).toBe(true);
  });

  it('情形 8：定义无静态目标（foreign/instance）→ 候选为空，但闸门只校验存在性，不判 MISMATCH', () => {
    // destinationContainerType 有值、destinationRef(s) 全空：典型 FOREIGN / INSTANCE 定义。
    const reference = externalRef({
      kind: 'instance',
      destinationRef: undefined,
      destinationRefs: undefined,
      destinationContainerType: 'ARoot',
    });
    const target = externalRef();
    expect(resolveExternalReferenceCandidates(target, scopeOf())).toHaveLength(1);
    // 无静态目标 → 绝不臆造候选。
    expect(resolveExternalReferenceCandidates(reference, scopeOf())).toEqual([]);

    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference),
      hostModule(reference),
      [],
      scopeOf()
    );
    expect(check.issues.filter((issue) => issue.ruleId === 'OUTPUT-EXTERNAL-MISMATCH')).toEqual([]);
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
  });

  it('未确认（isConfigured=false）的引用按空目标校验，不可借用残留 targetUuid', () => {
    const reference = externalRef();
    const check = evaluateOutputReadiness(
      hostConfig(IN_PROJECT_TARGET, reference, false),
      hostModule(reference),
      [],
      scopeOf()
    );
    // 引用「未确认」等于没选目标：必填仍须报 REQUIRED，而不是静默通过。
    expect(check.ready).toBe(false);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
    });
  });

  it('未确认的多值引用同样按空目标校验（targetUuids 必须与 targetUuid 一起掩码）', () => {
    const reference = externalRef();
    const config = hostConfig(IN_PROJECT_TARGET, reference, false);
    // isConfigured=false 但数组里残留目标：不得因此被当成「已配置」。
    config.containers[0]!.references.get(reference.uuid)!.targetUuids = [IN_PROJECT_TARGET];
    const check = evaluateOutputReadiness(config, hostModule(reference), [], scopeOf());
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
    });
  });

  it('多值跨模块引用：只对「不在工程内」的那个目标报 DANGLING', () => {    const reference = externalRef();
    const config = hostConfig(IN_PROJECT_TARGET, reference);
    // 同一引用的两个目标：一个在工程内、一个不在。
    config.containers[0]!.references.get(reference.uuid)!.targetUuids = [
      IN_PROJECT_TARGET,
      OUT_OF_PROJECT_TARGET,
    ];
    const check = evaluateOutputReadiness(config, hostModule(reference), [], scopeOf());
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      severity: 'ERROR',
      ruleId: 'OUTPUT-EXTERNAL-DANGLING',
    });
    // 不能因为一个目标坏了就把合法目标也判错。
    expect(check.issues[0]?.reason).toContain('跨模块引用目标不在当前工程内');
  });

  it('同一工程内 A↔B 双向跨模块引用：两个方向都通过，导出两边都能解析', () => {
    // A 的根容器也引用 B 的根容器，构成双向。
    const backRef: BswmdReference = {
      uuid: 'def.a.ref',
      shortName: 'ARootBackRef',
      kind: 'foreign',
      isExternal: true,
      isOptional: false,
      destinationRef: '/AUTOSAR/EcucDefs/SupplierB/BRoot',
      destinationContainerType: 'BRoot',
    };
    const rootA = containerDef('def.a.root', 'ARoot', TARGET_PATH);
    rootA.references = [backRef];
    const moduleA: BswmdModule = { shortName: 'SupplierA', version: '4.4.0', containers: [rootA] };

    const forward = externalRef();
    const moduleB = hostModule(forward);

    const configA = configOf('cfg.a', 'SupplierA', '4.4.0', [
      containerInstance(IN_PROJECT_TARGET, 'def.a.root', 'ARoot'),
    ]);
    configA.containers[0]!.references.set(backRef.uuid, {
      definitionRef: backRef.uuid,
      targetUuid: 'instance.b.root',
      isConfigured: true,
    });
    const configB = hostConfig(IN_PROJECT_TARGET, forward);

    const scope = buildProjectReferenceScope([
      { config: configA, module: moduleA },
      { config: configB, module: moduleB },
    ]);
    expect(evaluateOutputReadiness(configA, moduleA, [], scope).issues).toEqual([]);
    expect(evaluateOutputReadiness(configB, moduleB, [], scope).issues).toEqual([]);

    const xml = exportProjectArxml([
      { config: configA, module: moduleA },
      { config: configB, module: moduleB },
    ]);
    // 两个方向的 VALUE-REF 都必须写成绝对工程路径。
    expect(xml).toContain('>/Config/SupplierB/BRoot</VALUE-REF>');
    expect(xml).toContain('>/Config/SupplierA/ARoot</VALUE-REF>');
  });
});
