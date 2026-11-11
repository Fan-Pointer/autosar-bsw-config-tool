import { describe, expect, it } from 'vitest';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../src/core/config/ConfigTypes';
import {
  buildProjectReferenceScope,
  labelOf,
  resolveExternalReferenceCandidates,
} from '../src/core/config/ProjectReferenceScope';

/** 最小容器定义：只填作用域解析关心的字段。 */
function definition(
  uuid: string,
  shortName: string,
  options: { definitionPath?: string; subContainers?: BswmdContainer[] } = {}
): BswmdContainer {
  return {
    uuid,
    shortName,
    ...(options.definitionPath ? { definitionPath: options.definitionPath } : {}),
    multiplicity: { lower: 0, upper: 'unbounded' },
    parameters: [],
    references: [],
    subContainers: options.subContainers ?? [],
  };
}

/** 最小模块定义。 */
function module(shortName: string, version: string, containers: BswmdContainer[]): BswmdModule {
  return { shortName, version, containers };
}

/** 最小配置容器实例。 */
function instance(
  uuid: string,
  definitionRef: string,
  shortName: string,
  subContainers: ConfigContainer[] = []
): ConfigContainer {
  return {
    uuid,
    definitionRef,
    shortName,
    parameters: new Map(),
    references: new Map(),
    subContainers,
  };
}

/** 最小模块配置实例。 */
function config(
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

const DEM_DTC_PATH = '/AUTOSAR/EcucDefs/Dem/DemConfigSet/DemDTC';
const PARTITION_PATH = '/AUTOSAR/EcucDefs/EcuC/EcucPartitionCollection/EcucPartition';
const GENERAL_PATH = '/AUTOSAR/EcucDefs/Dem/DemGeneral';

const demDefinition = module('Dem', '4.4.0', [
  definition('dem.root', 'DemConfigSet', {
    definitionPath: '/AUTOSAR/EcucDefs/Dem/DemConfigSet',
    subContainers: [definition('dem.dtc', 'DemDTC', { definitionPath: DEM_DTC_PATH })],
  }),
  definition('dem.general', 'DemGeneral', { definitionPath: GENERAL_PATH }),
]);
const ecucDefinition = module('EcuC', '4.4.0', [
  definition('ecuc.partition', 'EcucPartition', { definitionPath: PARTITION_PATH }),
]);

const demConfig = config('cfg.dem', 'Dem', '4.4.0', [
  instance('dem.root', 'dem.root', 'DemConfigSet', [
    instance('dem.dtc.instance', 'dem.dtc', 'DemDTC'),
  ]),
  instance('dem.general.instance', 'dem.general', 'DemGeneral'),
]);
const ecucConfig = config('cfg.ecuc', 'EcuC', '4.4.0', [
  instance('ecuc.partition.instance', 'ecuc.partition', 'EcucPartition'),
]);

/** 跨模块（FOREIGN）引用：目标声明指向 EcuC 的分区定义。 */
const foreignReference = {
  uuid: 'dem.ref.partition',
  shortName: 'DemPartitionRef',
  destinationRef: PARTITION_PATH,
  isExternal: true,
  destinationContainerType: 'EcucPartition',
  isOptional: false,
};

const entries = [
  { config: demConfig, module: demDefinition },
  { config: ecucConfig, module: ecucDefinition },
];

describe('buildProjectReferenceScope', () => {
  it('indexes every container of every module in the project', () => {
    const scope = buildProjectReferenceScope(entries);
    expect(scope.containers.size).toBe(4);
    expect(scope.containers.get('ecuc.partition.instance')).toMatchObject({
      moduleShortName: 'EcuC',
      moduleVersion: '4.4.0',
      path: 'EcucPartition',
      definitionPath: PARTITION_PATH,
    });
    expect(scope.containers.has('缺失的目标')).toBe(false);
  });

  it('labels a target with its module so same-named containers stay distinguishable', () => {
    const scope = buildProjectReferenceScope(entries);
    expect(labelOf(scope, 'ecuc.partition.instance')).toBe('EcuC › EcucPartition');
    expect(labelOf(scope, 'dem.dtc.instance')).toBe('Dem › DemConfigSet/DemDTC');
    expect(labelOf(scope, '缺失的目标')).toBeUndefined();
    expect(labelOf(undefined, 'ecuc.partition.instance')).toBeUndefined();
    expect(scope.labels.get('dem.general.instance')).toBe('Dem › DemGeneral');
  });

  it('maps every target to the absolute ARXML path used by renderArxml', () => {
    const scope = buildProjectReferenceScope(entries);
    // 规则必须与 Arxml.ts 工程级导出完全一致：/Config/<模块>/<路径>。
    expect(scope.paths.get('ecuc.partition.instance')).toBe('/Config/EcuC/EcucPartition');
    expect(scope.paths.get('dem.dtc.instance')).toBe('/Config/Dem/DemConfigSet/DemDTC');
  });

  it('groups targets by definition path for candidate lookup', () => {
    const scope = buildProjectReferenceScope([
      ...entries,
      {
        config: config('cfg.dem2', 'Dem', '4.4.0', [instance('dem.dtc.second', 'dem.dtc', 'DemDTC')]),
        module: demDefinition,
      },
    ]);
    expect(scope.byDefinitionPath.get(DEM_DTC_PATH)?.map((target) => target.uuid)).toEqual([
      'dem.dtc.instance',
      'dem.dtc.second',
    ]);
    expect(scope.byDefinitionPath.get('/AUTOSAR/EcucDefs/Unknown')).toBeUndefined();
  });

  it('keeps the first record when container uuids repeat instead of throwing', () => {
    const scope = buildProjectReferenceScope([
      ...entries,
      // 历史库可能重复：重复记录不得让整个工程导不出。
      {
        config: config('cfg.dup', 'EcuC', '4.4.0', [
          instance('ecuc.partition.instance', 'ecuc.partition', 'EcucPartition'),
        ]),
        module: ecucDefinition,
      },
    ]);
    expect(scope.containers.size).toBe(4);
    expect(scope.containers.get('ecuc.partition.instance')?.path).toBe('EcucPartition');
  });

  it('skips a configuration whose definition is missing instead of failing the whole scope', () => {
    const broken = config('cfg.broken', 'Dem', '4.4.0', [
      instance('ghost', 'no.such.definition', 'Ghost'),
    ]);
    const scope = buildProjectReferenceScope([
      ...entries,
      { config: broken, module: demDefinition },
    ]);
    expect(scope.containers.size).toBe(4);
    expect(scope.containers.has('ghost')).toBe(false);
    expect(scope.containers.has('ecuc.partition.instance')).toBe(true);
  });

  it('yields an empty scope for an empty project', () => {
    const scope = buildProjectReferenceScope([]);
    expect(scope.containers.size).toBe(0);
    expect(scope.byDefinitionPath.size).toBe(0);
    expect(scope.labels.size).toBe(0);
    expect(scope.paths.size).toBe(0);
  });
});

describe('resolveExternalReferenceCandidates', () => {
  it('resolves an external reference against other modules of the same project', () => {
    const scope = buildProjectReferenceScope(entries);
    const candidates = resolveExternalReferenceCandidates(foreignReference, scope);
    expect(candidates.map((target) => target.uuid)).toEqual(['ecuc.partition.instance']);
    expect(candidates[0]?.label).toBe('EcuC › EcucPartition');
  });

  it('returns nothing when there is no project context', () => {
    expect(resolveExternalReferenceCandidates(foreignReference, undefined)).toEqual([]);
  });

  it('never fabricates a candidate for a reference that declares no destination', () => {
    const scope = buildProjectReferenceScope(entries);
    const instanceRef = {
      uuid: 'dem.ref.instance',
      shortName: 'DemInstanceRef',
      isExternal: true,
      destinationContainerType: 'DemDTC',
      isOptional: true,
    };
    expect(resolveExternalReferenceCandidates(instanceRef, scope)).toEqual([]);
  });

  it('does not exclude the referencing module itself for CHOICE references', () => {
    const scope = buildProjectReferenceScope(entries);
    const choice = {
      uuid: 'dem.ref.choice',
      shortName: 'DemChoice',
      destinationRefs: [DEM_DTC_PATH, PARTITION_PATH],
      isExternal: true,
      destinationContainerType: 'DemDTC',
      isOptional: true,
    };
    expect(resolveExternalReferenceCandidates(choice, scope).map((target) => target.label)).toEqual([
      'Dem › DemConfigSet/DemDTC',
      'EcuC › EcucPartition',
    ]);
  });

  it('matches by exact definition path only', () => {
    const scope = buildProjectReferenceScope(entries);
    const nearMiss = {
      ...foreignReference,
      uuid: 'dem.ref.near',
      destinationRef: '/AUTOSAR/EcucDefs/EcuC/EcucPartitionCollection',
    };
    expect(resolveExternalReferenceCandidates(nearMiss, scope)).toEqual([]);
  });

  it('prefers every candidate path of a choice reference over the single destinationRef', () => {
    const scope = buildProjectReferenceScope(entries);
    const choice = {
      uuid: 'dem.ref.choice2',
      shortName: 'DemChoice2',
      destinationRef: GENERAL_PATH,
      destinationRefs: [PARTITION_PATH],
      isExternal: true,
      destinationContainerType: 'EcucPartition',
      isOptional: true,
    };
    expect(resolveExternalReferenceCandidates(choice, scope).map((target) => target.uuid)).toEqual([
      'ecuc.partition.instance',
    ]);
  });
});
