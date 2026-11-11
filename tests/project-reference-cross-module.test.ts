import { describe, expect, it } from 'vitest';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../src/core/config/ConfigTypes';
import { buildProjectReferenceScope } from '../src/core/config/ProjectReferenceScope';
import { exportProjectArxml, importArxml } from '../src/core/io/Arxml';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';

const A_ROOT = '/AUTOSAR/EcucDefs/SupplierA/ARoot';
const B_ROOT = '/AUTOSAR/EcucDefs/SupplierB/BRoot';

/** 只含一个根容器的模块定义。 */
function moduleOf(
  shortName: string,
  rootUuid: string,
  rootName: string,
  definitionPath: string,
  references: BswmdModule['containers'][number]['references'] = []
): BswmdModule {
  const root: BswmdContainer = {
    uuid: rootUuid,
    shortName: rootName,
    definitionPath,
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references,
    subContainers: [],
  };
  return { shortName, version: '4.4.0', containers: [root] };
}

/** 只含一个根容器的配置实例。 */
function configOf(
  uuid: string,
  moduleRef: string,
  containers: ConfigContainer[]
): ConfigInstance {
  return { uuid, name: `${moduleRef} 配置`, moduleRef, version: '4.4.0', containers, createdAt: 0, lastModified: 0 };
}

/** A 模块：一个被引用的根容器。 */
const moduleA = moduleOf('SupplierA', 'def.a.root', 'ARoot', A_ROOT);
const configA = configOf('cfg.a', 'SupplierA', [
  {
    uuid: 'instance.a.root',
    definitionRef: 'def.a.root',
    shortName: 'ARoot',
    parameters: new Map(),
    references: new Map(),
    subContainers: [],
  },
]);

/** B 模块：一条必填的跨模块引用，目标声明指向 A 的根容器定义。 */
const moduleB = moduleOf('SupplierB', 'def.b.root', 'BRoot', B_ROOT, [
  {
    uuid: 'def.b.ref',
    shortName: 'BRootRef',
    definitionPath: '/AUTOSAR/EcucDefs/SupplierB/BRoot/BRootRef',
    destinationRef: A_ROOT,
    isExternal: true,
    kind: 'foreign',
    destinationContainerType: 'ARoot',
    isOptional: false,
  },
]);

/** 构造 B 的配置；`target` 为空表示未选择目标。 */
function configB(target: string): ConfigInstance {
  const references = new Map<string, { definitionRef: string; targetUuid: string; isConfigured: boolean }>();
  if (target) references.set('def.b.ref', { definitionRef: 'def.b.ref', targetUuid: target, isConfigured: true });
  return configOf('cfg.b', 'SupplierB', [
    {
      uuid: 'instance.b.root',
      definitionRef: 'def.b.root',
      shortName: 'BRoot',
      parameters: new Map(),
      references: references as never,
      subContainers: [],
    },
  ]);
}

const entries = [
  { config: configA, module: moduleA },
  { config: configB('instance.a.root'), module: moduleB },
];

describe('cross-module reference: selectable, validatable, exportable', () => {
  it('accepts a mandatory cross-module reference whose target lives in another module of the project', () => {
    const scope = buildProjectReferenceScope(entries);
    const check = evaluateOutputReadiness(configB('instance.a.root'), moduleB, [], scope);
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
  });

  it('keeps rejecting the same reference without a project context', () => {
    const check = evaluateOutputReadiness(configB('instance.a.root'), moduleB);
    expect(check.ready).toBe(false);
    expect(check.issues[0]).toMatchObject({ ruleId: 'OUTPUT-EXTERNAL-NO-SCOPE', severity: 'ERROR' });
    expect(check.issues[0]?.reason).toContain('跨模块引用需在工程上下文中导出');
  });

  it('reports a mandatory cross-module reference with no target at all', () => {
    const scope = buildProjectReferenceScope(entries);
    const check = evaluateOutputReadiness(configB(''), moduleB, [], scope);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
      severity: 'ERROR',
    });
    expect(check.issues[0]?.reason).toContain('必填跨模块引用未选择目标：BRootRef → ' + A_ROOT);
  });

  it('treats an unconfirmed multi-value reference as having no target at all', () => {
    // 手改 JSON / 旧库残留可能出现 isConfigured:false 但仍带着 targetUuids：
    // 未确认引用等价于「未选择目标」，单值与多值必须口径一致，不能被判成已配置。
    const scope = buildProjectReferenceScope(entries);
    const unconfirmed = configOf('cfg.b', 'SupplierB', [
      {
        uuid: 'instance.b.root',
        definitionRef: 'def.b.root',
        shortName: 'BRoot',
        parameters: new Map(),
        references: new Map([
          [
            'def.b.ref',
            {
              definitionRef: 'def.b.ref',
              targetUuid: '',
              targetUuids: ['instance.a.root'],
              isConfigured: false,
            },
          ],
        ]),
        subContainers: [],
      } as never,
    ]);
    const check = evaluateOutputReadiness(unconfirmed, moduleB, [], scope);
    expect(check.ready).toBe(false);
    expect(check.issues[0]).toMatchObject({
      ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
      severity: 'ERROR',
    });
  });

  it('reports a target that is not part of the project as dangling instead of accepting it', () => {
    const scope = buildProjectReferenceScope(entries);
    const outsider = configB('instance.from.another.project');
    const check = evaluateOutputReadiness(outsider, moduleB, [], scope);
    expect(check.issues[0]).toMatchObject({
      ruleId: 'OUTPUT-EXTERNAL-DANGLING',
      severity: 'ERROR',
    });
    expect(check.issues[0]?.reason).toContain('跨模块引用目标不在当前工程内');
  });

  it('reports a target of the wrong definition type as a mismatch', () => {
    // 目标在工程内，但定义路径是 BRoot（不是引用声明的 ARoot）。
    const wrongType = moduleOf('SupplierC', 'def.c.root', 'CRoot', B_ROOT);
    const wrongConfig = configOf('cfg.c', 'SupplierC', [
      {
        uuid: 'instance.c.root',
        definitionRef: 'def.c.root',
        shortName: 'CRoot',
        parameters: new Map(),
        references: new Map(),
        subContainers: [],
      },
    ]);
    const scope = buildProjectReferenceScope([
      ...entries,
      { config: wrongConfig, module: wrongType },
    ]);
    const check = evaluateOutputReadiness(configB('instance.c.root'), moduleB, [], scope);
    expect(check.issues[0]).toMatchObject({
      ruleId: 'OUTPUT-EXTERNAL-MISMATCH',
      severity: 'ERROR',
    });
    expect(check.issues[0]?.reason).toContain('跨模块引用目标类型不匹配');
  });

  it('flags a version drift as a non-blocking warning', () => {
    const drifted = configOf('cfg.a', 'SupplierA', configA.containers);
    drifted.version = '4.2.2';
    const scope = buildProjectReferenceScope([
      { config: drifted, module: moduleA },
      entries[1]!,
    ]);
    const check = evaluateOutputReadiness(configB('instance.a.root'), moduleB, [], scope);
    expect(check.ready).toBe(true);
    expect(check.issues).toHaveLength(1);
    expect(check.issues[0]).toMatchObject({
      ruleId: 'OUTPUT-EXTERNAL-VERSION-DRIFT',
      severity: 'WARNING',
    });
  });

  it('writes the cross-module target as an absolute /Config path in the project ARXML', () => {
    const xml = exportProjectArxml(entries);
    expect(xml).toContain('<VALUE-REF DEST="ECUC-CONTAINER-VALUE">/Config/SupplierA/ARoot</VALUE-REF>');
    expect(xml).toContain('<SHORT-NAME>SupplierB</SHORT-NAME>');
    expect(xml).toContain('<SHORT-NAME>SupplierA</SHORT-NAME>');
  });

  it('refuses to import a single module segment whose cross-module target is not in the document', () => {
    // 单模块段导入无法解析其它模块的目标：必须明确报错，不能静默把目标留成悬空 uuid。
    const xml = exportProjectArxml(entries);
    expect(xml).toContain('/Config/SupplierA/ARoot');
    expect(() => importArxml(xml, [moduleA, moduleB], undefined, 'SupplierB')).toThrow(
      '引用目标未包含在文件中'
    );
    // 同一份文档导入引用方所在模块段时，目标模块在文档中也必须一起参与解析；
    // 因此只有工程级导入（store.importArxmlModules）才能完成跨模块闭环。
  });

  it('blocks the project export when the target belongs to no module of the project', () => {
    const broken = [{ config: configB('instance.from.another.project'), module: moduleB }, entries[0]!];
    expect(() => exportProjectArxml(broken)).toThrow(/未通过输出校验/);
  });
});
