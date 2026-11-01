// @vitest-environment node
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { BswmdLoader } from '../src/core/bswmd/BswmdLoader';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers, indexDefinitions } from '../src/core/config/ConfigTraversal';
import { ConstraintEngine } from '../src/core/constraint/ConstraintEngine';
import { DemConstraints } from '../src/modules/dem/DemConstraints';
import { DefinitionConstraints } from '../src/core/constraint/DefinitionConstraints';
import { TemplateEngine } from '../src/core/generator/TemplateEngine';
import { CGenerator } from '../src/core/generator/CGenerator';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';

const source = readFileSync(resolve('bswmd/dem_bswmd.json'), 'utf8');
const parser = new BswmdParser();
const manager = new ConfigInstanceManager();

afterEach(() => vi.unstubAllGlobals());

describe('BSWMD parser and loader', () => {
  it('parses all seven listed container definitions, defaults and the aging reference', () => {
    const module = parser.parseFromJson(source);
    expect(indexDefinitions(module).size).toBe(67);
    expect(module.containers[0].subContainers).toHaveLength(10);
    const attributes = module.containers[0].subContainers.find((item) => item.shortName === 'DemDTCAttributes')!;
    expect(attributes.references.some((item) => item.shortName === 'DemAgingCycleRef')).toBe(true);
    expect(attributes.parameters.some((item) => item.shortName === 'DemAgingCycleRef')).toBe(false);
  });

  it.each(['uuid', 'shortName', 'type'])(
    'reports missing parameter %s with its location',
    (field) => {
      const data = JSON.parse(source) as BswmdModule;
      Reflect.deleteProperty(data.containers[0].subContainers[0].parameters[0], field);
      expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow(field);
      expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow('parameters[0]');
    }
  );

  it('reports a missing nested container uuid with its index and name', () => {
    const data = JSON.parse(source) as BswmdModule;
    Reflect.deleteProperty(data.containers[0].subContainers[0], 'uuid');
    expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow(/subContainers\[0\].*DemComponent.*uuid/);
  });

  it.each(['null', '[]', '{"shortName":"Dem","containers":{}}'])(
    'rejects malformed root or array shapes: %s',
    (json) => {
      expect(() => parser.parseFromJson(json)).toThrow('Failed to parse BSWMD JSON');
    }
  );

  it('rejects unsupported parameter types and duplicate definition UUIDs', () => {
    const data = JSON.parse(source) as BswmdModule;
    Reflect.set(data.containers[1].parameters[0], 'type', 'INVALID');
    expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow('type');
    data.containers[1].parameters = [];
    data.containers[0].subContainers[1].uuid = data.containers[0].subContainers[0].uuid;
    expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow('duplicate uuid');
  });

  it('preserves upper zero and rejects excessive nesting with a useful error', () => {
    const zero = parser.parseFromJson(
      '{"shortName":"Dem","containers":[{"uuid":"zero","shortName":"Zero","multiplicity":{"lower":0,"upper":0}}]}'
    );
    expect(zero.containers[0].multiplicity.upper).toBe(0);
    expect(manager.createFromBswmd(zero).containers).toHaveLength(0);
    const root: BswmdContainer = {
      uuid: 'root',
      shortName: 'Root',
      multiplicity: { lower: 1, upper: 1 },
      parameters: [],
      references: [],
      subContainers: [],
    };
    let cursor = root;
    for (let i = 0; i < 130; i++) {
      const child: BswmdContainer = { ...root, uuid: `depth-${i}`, subContainers: [] };
      cursor.subContainers = [child];
      cursor = child;
    }
    expect(() =>
      parser.parseFromJson(JSON.stringify({ shortName: 'Dem', containers: [root] }))
    ).toThrow('maximum container depth');
  });

  it('loads string, File and URL sources into a shortName cache', async () => {
    const loader = new BswmdLoader();
    loader.loadFromString(source);
    await loader.loadFromFile(new File([source], 'dem.json'));
    const fetch = vi.fn().mockResolvedValue(new Response(source));
    vi.stubGlobal('fetch', fetch);
    await loader.loadFromUrl('/dem.json');
    expect(loader.listModules()).toEqual(['Dem']);
    expect(loader.getModule('Dem')?.version).toBe('4.4.0');
    expect(loader.getAllModules()).toHaveLength(1);
    fetch.mockResolvedValue(new Response('', { status: 404 }));
    await expect(loader.loadFromUrl('/missing.json')).rejects.toThrow('404');
    expect(loader.listModules()).toEqual(['Dem']);
    loader.clearCache();
    expect(loader.listModules()).toEqual([]);
  });
});

// 合成迷你 Dem：容器/参数与官方同名（DemConstraints 按 shortName 守门），uuid 用语义 id，
// 并保留一个 STRING 参数（官方定义已无 STRING）。实例管理器的行为单测与真实定义解耦，
// 定义切换不再影响本段；官方定义的集成行为由 editor/lifecycle/io 等测试覆盖。
function synthDem(): BswmdModule {
  return {
    shortName: 'Dem',
    version: 'synth-1.0.0',
    containers: [
      {
        uuid: 'syn-configset-def',
        shortName: 'DemConfigSet',
        multiplicity: { lower: 1, upper: 1 },
        parameters: [],
        references: [],
        subContainers: [
          {
            uuid: 'syn-dtc-def',
            shortName: 'DemDTC',
            multiplicity: { lower: 0, upper: 65535 },
            parameters: [
              { uuid: 'syn-dtc-value', shortName: 'DemDtcValue', configClass: 'PRE_COMPILE', type: 'INTEGER', multiplicity: { lower: 1, upper: 1 }, isOptional: true, defaultValue: 1, min: 1, max: 0xffffff },
              { uuid: 'syn-dtc-severity', shortName: 'DemDTCSeverity', configClass: 'PRE_COMPILE', type: 'ENUM', multiplicity: { lower: 1, upper: 1 }, isOptional: true, enumValues: ['DEM_SEVERITY_NO_SEVERITY', 'DEM_SEVERITY_CHECK_IMMEDIATELY'], defaultValue: 'DEM_SEVERITY_NO_SEVERITY' },
              { uuid: 'syn-dtc-j1939', shortName: 'DemJ1939NodeRef', configClass: 'PRE_COMPILE', type: 'STRING', multiplicity: { lower: 1, upper: 1 }, isOptional: true },
            ],
            references: [
              { uuid: 'syn-dtc-attributes-ref', shortName: 'DemDTCAttributesRef', multiplicity: { lower: 0, upper: 1 }, isOptional: true, destinationRef: '/AUTOSAR/EcucDefs/Dem/DemConfigSet/DemDTCAttributes', destinationContainerType: 'DemDTCAttributes' },
            ],
            subContainers: [],
          },
          {
            uuid: 'syn-attr-def',
            shortName: 'DemDTCAttributes',
            multiplicity: { lower: 0, upper: 65535 },
            parameters: [
              { uuid: 'syn-attr-aging-allowed', shortName: 'DemAgingAllowed', configClass: 'PRE_COMPILE', type: 'BOOLEAN', multiplicity: { lower: 1, upper: 1 }, isOptional: false },
            ],
            references: [
              { uuid: 'syn-attr-aging-ref', shortName: 'DemAgingCycleRef', multiplicity: { lower: 0, upper: 1 }, isOptional: true, destinationRef: '/AUTOSAR/EcucDefs/Dem/DemConfigSet/DemOperationCycle', destinationContainerType: 'DemOperationCycle' },
            ],
            subContainers: [],
          },
          {
            uuid: 'syn-event-def',
            shortName: 'DemEventParameter',
            multiplicity: { lower: 1, upper: 65535 },
            parameters: [
              { uuid: 'syn-event-id', shortName: 'DemEventId', configClass: 'PRE_COMPILE', type: 'INTEGER', multiplicity: { lower: 1, upper: 1 }, isOptional: false, min: 1, max: 65535 },
            ],
            references: [],
            subContainers: [],
          },
          {
            uuid: 'syn-cycle-def',
            shortName: 'DemOperationCycle',
            multiplicity: { lower: 0, upper: 256 },
            parameters: [
              { uuid: 'syn-cycle-type', shortName: 'DemOperationCycleType', configClass: 'PRE_COMPILE', type: 'ENUM', multiplicity: { lower: 1, upper: 1 }, isOptional: false, enumValues: ['DEM_OPCYC_IGNITION', 'DEM_OPCYC_CONTINUOUS'], defaultValue: 'DEM_OPCYC_IGNITION' },
            ],
            references: [],
            subContainers: [],
          },
          {
            uuid: 'syn-debounce-def',
            shortName: 'DemDebounceCounterBasedClass',
            multiplicity: { lower: 0, upper: 65535 },
            parameters: [
              { uuid: 'syn-debounce-failed', shortName: 'DemDebounceCounterFailedThreshold', configClass: 'PRE_COMPILE', type: 'INTEGER', multiplicity: { lower: 1, upper: 1 }, isOptional: true, min: -128, max: 127 },
              { uuid: 'syn-debounce-passed', shortName: 'DemDebounceCounterPassedThreshold', configClass: 'PRE_COMPILE', type: 'INTEGER', multiplicity: { lower: 1, upper: 1 }, isOptional: true, min: -128, max: 127 },
            ],
            references: [],
            subContainers: [],
          },
        ],
      },
      {
        uuid: 'syn-general-def',
        shortName: 'DemGeneral',
        multiplicity: { lower: 1, upper: 1 },
        parameters: [
          { uuid: 'syn-general-dev-error', shortName: 'DemDevErrorDetect', configClass: 'PRE_COMPILE', type: 'BOOLEAN', multiplicity: { lower: 1, upper: 1 }, isOptional: true, defaultValue: false },
        ],
        references: [],
        subContainers: [],
      },
    ],
  };
}

function synthFixture(count = 1) {
  const module = synthDem();
  const config = manager.createFromBswmd(module);
  const root = config.containers[0];
  for (const definition of module.containers[0].subContainers) {
    if (definition.multiplicity.lower === 0) {
      manager.addContainerInstance(config, root.uuid, definition.uuid);
    }
  }
  const find = (name: string) => {
    const entry = collectContainers(config, module).find(
      (item) => item.definition.shortName === name
    );
    if (!entry) throw new Error(`Missing fixture ${name}`);
    return entry.container;
  };
  const engine = new ConstraintEngine();
  engine.registerRules([...DefinitionConstraints, ...DemConstraints]);
  return {
    module,
    config,
    root,
    find,
    engine,
    ids: Array.from({ length: count }, (_, index) => index),
  };
}


describe('configuration instances and constraints', () => {
  const fixture = synthFixture;

  it('starts with zero optional children, then adds and removes one by definition', () => {
    const module = synthDem();
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    // 官方语义: lower=1 的 DemEventParameter 在创建时预建, 可选容器不预建
    expect(root.subContainers).toHaveLength(1);
    expect(root.subContainers[0].shortName).toBe('DemEventParameter');
    const engine = new ConstraintEngine();
    engine.registerRules([...DefinitionConstraints, ...DemConstraints]);
    expect(engine.validate(config, module)).toEqual([]);
    config.lastModified = 0;
    const dtc = manager.addContainerInstance(config, root.uuid, 'syn-dtc-def');
    expect(root.subContainers).toEqual([root.subContainers[0], dtc]);
    expect(dtc.definitionRef).toBe('syn-dtc-def');
    expect(dtc.parameters.get('syn-dtc-value')).toMatchObject({
      value: 1,
      isConfigured: false,
    });
    expect(config.lastModified).toBeGreaterThan(0);
    config.lastModified = 0;
    expect(manager.removeContainerInstance(config, dtc.uuid)).toBe(dtc);
    expect(root.subContainers).toHaveLength(1);
    expect(config.lastModified).toBeGreaterThan(0);
  });

  it('adds multiple DTCs with unique identities and names even after a deletion', () => {
    const module = synthDem();
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const first = manager.addContainerInstance(config, root.uuid, 'syn-dtc-def');
    const second = manager.addContainerInstance(config, root.uuid, 'syn-dtc-def');
    const third = manager.addContainerInstance(config, root.uuid, 'syn-dtc-def');
    manager.setParameterValue(first, 'syn-dtc-value', 123);
    expect(second.parameters.get('syn-dtc-value')?.value).toBe(1);
    expect(new Set([first.uuid, second.uuid, third.uuid]).size).toBe(3);
    manager.removeContainerInstance(config, second.uuid);
    const replacement = manager.addContainerInstance(config, root.uuid, 'syn-dtc-def');
    expect(replacement.uuid).not.toBe(second.uuid);
    const dtcNames = root.subContainers
      .map((item) => item.shortName)
      .filter((item) => item.startsWith('DemDTC'));
    expect(new Set(dtcNames).size).toBe(3);
    const engine = new ConstraintEngine();
    engine.registerRules(DemConstraints);
    expect(
      engine.validate(config, module).filter((item) => item.ruleId === 'DEM-001')
    ).toHaveLength(2);
  });

  it('enforces sibling bounds and parent definitions without mutating failed operations', () => {
    const module = synthDem();
    const dtcDefinition = module.containers[0].subContainers[0];
    dtcDefinition.multiplicity = { lower: 1, upper: 2 };
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const first = root.subContainers.find((item) => item.shortName === 'DemDTC')!;
    expect(root.subContainers.filter((item) => item.shortName === 'DemDTC')).toHaveLength(1);
    expect(() => manager.removeContainerInstance(config, first.uuid)).toThrow(
      'lower multiplicity 1'
    );
    const second = manager.addContainerInstance(config, root.uuid, dtcDefinition.uuid);
    const snapshot = structuredClone(config);
    expect(() => manager.addContainerInstance(config, root.uuid, dtcDefinition.uuid)).toThrow(
      'upper multiplicity 2'
    );
    expect(() => manager.addContainerInstance(config, first.uuid, dtcDefinition.uuid)).toThrow(
      'not allowed'
    );
    expect(() => manager.addContainerInstance(config, 'missing', dtcDefinition.uuid)).toThrow(
      'Parent container not found'
    );
    expect(() => manager.addContainerInstance(config, root.uuid, 'missing')).toThrow('not allowed');
    expect(() => manager.removeContainerInstance(config, 'missing')).toThrow('Container not found');
    expect(() => manager.removeContainerInstance(config, root.uuid)).toThrow(
      'lower multiplicity 1'
    );
    expect(config).toEqual(snapshot);
    manager.removeContainerInstance(config, second.uuid);
    expect(root.subContainers.filter((item) => item.shortName === 'DemDTC')).toEqual([first]);
  });

  it('supports root containers, zero upper bounds and a restored config with supplied definitions', () => {
    const module = synthDem();
    module.containers = [module.containers[0]];
    module.containers[0].multiplicity = { lower: 0, upper: 2 };
    module.containers[0].subContainers.forEach((item) => {
      item.multiplicity = { lower: 0, upper: item.multiplicity.upper };
    });
    const config = structuredClone(manager.createFromBswmd(module));
    const restoredManager = new ConfigInstanceManager([module]);
    expect(config.containers).toHaveLength(0);
    const root = restoredManager.addContainerInstance(config, null, module.containers[0].uuid);
    expect(config.containers).toEqual([root]);
    expect(root.subContainers).toHaveLength(0);
    restoredManager.removeContainerInstance(config, root.uuid);
    expect(config.containers).toHaveLength(0);
    module.containers[0].multiplicity.upper = 0;
    expect(() =>
      restoredManager.addContainerInstance(config, null, module.containers[0].uuid)
    ).toThrow('upper multiplicity 0');
    expect(() =>
      new ConfigInstanceManager().addContainerInstance(config, null, module.containers[0].uuid)
    ).toThrow('BSWMD module not loaded');
  });

  it('creates required descendants and removes nested subtrees at the correct parent', () => {
    const module = synthDem();
    const dtcDefinition = module.containers[0].subContainers[0];
    const cycleIndex = module.containers[0].subContainers.findIndex(
      (item) => item.shortName === 'DemOperationCycle'
    );
    const cycleDefinition = module.containers[0].subContainers.splice(cycleIndex, 1)[0];
    cycleDefinition.multiplicity = { lower: 2, upper: 3 };
    dtcDefinition.subContainers = [cycleDefinition];
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const dtc = manager.addContainerInstance(config, root.uuid, dtcDefinition.uuid);
    expect(dtc.subContainers).toHaveLength(2);
    expect(dtc.subContainers[0].parameters.get('syn-cycle-type')?.value).toBe(
      'DEM_OPCYC_IGNITION'
    );
    const cycle = manager.addContainerInstance(config, dtc.uuid, cycleDefinition.uuid);
    expect(dtc.subContainers).toHaveLength(3);
    manager.removeContainerInstance(config, cycle.uuid);
    expect(dtc.subContainers).toHaveLength(2);
    manager.removeContainerInstance(config, dtc.uuid);
    expect(root.subContainers).toHaveLength(1);
    expect(manager.findContainer(config, dtc.subContainers[0].uuid)).toBeNull();
  });

  it('recursively creates instances, preserves definitions, and updates values and references', () => {
    const module = synthDem();
    const parent = module.containers[0].subContainers[0];
    const cycleIndex = module.containers[0].subContainers.findIndex(
      (item) => item.shortName === 'DemOperationCycle'
    );
    parent.subContainers.push(module.containers[0].subContainers.splice(cycleIndex, 1)[0]);
    for (const definition of indexDefinitions(module).values()) definition.multiplicity.lower = 1;
    const config = manager.createFromBswmd(module);
    const entries = collectContainers(config, module);
    // Root + DemGeneral + 4 个 Root 子(Cycle 被 splice 移入 DTC) + DTC 下预建的 Cycle
    expect(entries).toHaveLength(7);
    expect(new Set(entries.map((entry) => entry.container.uuid)).size).toBe(7);
    const nested = config.containers[0].subContainers[0].subContainers[0];
    expect(manager.findContainer(config, nested.uuid)).toBe(nested);
    expect(manager.findContainer(config, 'missing')).toBeNull();
    const dtc = config.containers[0].subContainers[0];
    expect(dtc.parameters.get('syn-dtc-value')).toMatchObject({
      value: 1,
      definitionRef: 'syn-dtc-value',
      isConfigured: false,
    });
    manager.setParameterValue(dtc, 'syn-dtc-value', 0x123456);
    manager.setReferenceTarget(dtc, 'syn-dtc-attributes-ref', nested.uuid);
    expect(dtc.parameters.get('syn-dtc-value')?.isConfigured).toBe(true);
    expect(dtc.references.get('syn-dtc-attributes-ref')?.targetUuid).toBe(nested.uuid);
    expect(() => manager.setParameterValue(dtc, 'missing', 1)).toThrow('missing');
    expect(() => manager.setReferenceTarget(dtc, 'missing', '')).toThrow('missing');
  });

  it('reports duplicate DTC values across separate config sets', () => {
    const { module, config, engine } = fixture();
    const second = fixture().config.containers[0];
    second.shortName = 'SecondConfig';
    config.containers.push(second);
    const errors = engine.validate(config, module).filter((item) => item.ruleId === 'DEM-001');
    expect(errors).toHaveLength(2);
    expect(errors[1]).toMatchObject({
      severity: 'ERROR',
      path: 'SecondConfig/DemDTC/DemDtcValue',
      containerUuid: second.subContainers.find((item) => item.shortName === 'DemDTC')!.uuid,
    });
  });

  it.each([0, 16777216, 1.5, NaN, Infinity, '1', undefined])(
    'rejects invalid DTC value %s',
    (value) => {
      const { module, config, find, engine } = fixture();
      manager.setParameterValue(find('DemDTC'), 'syn-dtc-value', value);
      expect(
        engine.validate(config, module).filter((item) => item.ruleId === 'DEM-002')
      ).toHaveLength(1);
    }
  );

  it('validates threshold signs and event ID bounds/uniqueness', () => {
    const { module, config, find, engine } = fixture();
    manager.setParameterValue(
      find('DemDebounceCounterBasedClass'),
      'syn-debounce-failed',
      0
    );
    manager.setParameterValue(
      find('DemDebounceCounterBasedClass'),
      'syn-debounce-passed',
      0
    );
    manager.setParameterValue(find('DemEventParameter'), 'syn-event-id', 65536);
    expect(
      engine.validate(config, module).filter((item) => item.ruleId === 'DEM-003')
    ).toHaveLength(2);
    expect(engine.validate(config, module).some((item) => item.ruleId === 'DEM-006')).toBe(true);
    manager.setParameterValue(find('DemEventParameter'), 'syn-event-id', 1);
    config.containers.push(fixture().config.containers[0]);
    expect(
      engine.validate(config, module).filter((item) => item.ruleId === 'DEM-006')
    ).toHaveLength(1);
  });

  it('requires an existing operation cycle only when aging is enabled', () => {
    const { module, config, find, engine } = fixture();
    const attributes = find('DemDTCAttributes');
    const check = () => engine.validate(config, module).filter((item) => item.ruleId === 'DEM-008');
    expect(check()).toHaveLength(0);
    manager.setParameterValue(attributes, 'syn-attr-aging-allowed', true);
    expect(check()).toHaveLength(1);
    manager.setReferenceTarget(attributes, 'syn-attr-aging-ref', find('DemDTC').uuid);
    expect(check()).toHaveLength(1);
    manager.setReferenceTarget(
      attributes,
      'syn-attr-aging-ref',
      find('DemOperationCycle').uuid
    );
    expect(check()).toHaveLength(0);
  });

  it('isolates rule exceptions, supports replacement and unregistration', () => {
    const { module, config } = fixture();
    const engine = new ConstraintEngine();
    engine.registerRule({
      id: 'broken',
      name: 'broken',
      scope: 'MODULE',
      severity: 'WARNING',
      check: () => {
        throw new Error('规则内部错误');
      },
    });
    expect(() => engine.validate(config, module)).not.toThrow();
    const replacement = {
      id: 'broken',
      name: 'broken-fixed',
      scope: 'MODULE' as const,
      severity: 'WARNING' as const,
      check: () => [],
    };
    engine.registerRule(replacement);
    expect(engine.getRules().find((item) => item.id === 'broken')?.name).toBe('broken-fixed');
    engine.unregisterRule('broken');
    expect(engine.getRules().some((item) => item.id === 'broken')).toBe(false);
  });

});

describe('definition-driven diagnostic messages', () => {
  function diagnosticFixture() {
    const module = parser.parseFromJson(
      JSON.stringify({
        shortName: 'Example',
        containers: [
          {
            uuid: 'root',
            shortName: 'Root',
            parameters: [
              { uuid: 'text', shortName: 'RequiredText', type: 'STRING', isOptional: false },
              { uuid: 'optional', shortName: 'OptionalText', type: 'STRING', isOptional: true },
              { uuid: 'count', shortName: 'Count', type: 'INTEGER', min: 1, max: 10 },
              { uuid: 'ratio', shortName: 'Ratio', type: 'FLOAT', min: 0, max: 1 },
              { uuid: 'enabled', shortName: 'Enabled', type: 'BOOLEAN' },
              { uuid: 'mode', shortName: 'Mode', type: 'ENUM', enumValues: ['OFF', 'ON', 'AUTO'] },
              { uuid: 'blank-mode', shortName: 'BlankMode', type: 'ENUM', enumValues: ['', 'ON'] },
            ],
          },
        ],
      })
    );
    const config = manager.createFromBswmd(module);
    const engine = new ConstraintEngine();
    engine.registerRules(DefinitionConstraints);
    const set = (id: string, value: unknown) =>
      manager.setParameterValue(config.containers[0], id, value);
    const check = () => engine.validate(config, module);
    return { module, config, set, check };
  }

  it('accepts empty required STRING and an explicitly allowed empty ENUM literal', () => {
    const { set, check } = diagnosticFixture();
    set('text', '');
    set('blank-mode', '');
    expect(check()).toEqual([]);
  });

  it.each([undefined, null])('reports only missing required fields for %s', (value) => {
    const { set, check } = diagnosticFixture();
    set('text', value);
    set('optional', value);
    expect(check()).toEqual([
      expect.objectContaining({
        message: 'RequiredText is required',
        suggestion: 'Set required parameter RequiredText (STRING)',
        definitionRef: 'text',
        path: 'Root/RequiredText',
      }),
    ]);
  });

  it.each([
    ['text', 1, 'STRING'],
    ['count', '', 'INTEGER'],
    ['count', 1.5, 'INTEGER'],
    ['ratio', Infinity, 'FLOAT'],
    ['enabled', 'false', 'BOOLEAN'],
    ['mode', 1, 'ENUM'],
  ])('identifies the expected type for %s = %s', (id, value, expected) => {
    const { set, check } = diagnosticFixture();
    set(String(id), value);
    const violations = check();
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain(`invalid type; expected ${expected}`);
    expect(violations[0].suggestion).toContain(`Use ${expected}`);
    expect(violations[0].message).not.toContain('is required');
  });

  it('lists exact numeric bounds and distinguishes domain errors from missing values and types', () => {
    const { set, check } = diagnosticFixture();
    set('count', 11);
    set('ratio', -0.1);
    expect(check()).toEqual([
      expect.objectContaining({
        message: 'Count is out of range; allowed range: [1, 10]',
        suggestion: 'Choose a INTEGER value in [1, 10]',
      }),
      expect.objectContaining({
        message: 'Ratio is out of range; allowed range: [0, 1]',
        suggestion: 'Choose a FLOAT value in [0, 1]',
      }),
    ]);
    set('count', 1);
    set('ratio', 1);
    expect(check()).toEqual([]);
  });

  it.each(['INVALID', ''])('lists every ENUM candidate for invalid literal %s', (value) => {
    const { set, check } = diagnosticFixture();
    set('mode', value);
    const violations = check();
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toBe(
      'Mode has an invalid choice; allowed values: "OFF", "ON", "AUTO"'
    );
    expect(violations[0].suggestion).toBe('Choose one of: "OFF", "ON", "AUTO"');
  });
});

describe('template and C generation', () => {
  it('renders Handlebars content and template metadata; accepts empty templates and rejects missing ones', async () => {
    const engine = new TemplateEngine();
    engine.registerTemplate({
      name: 'test',
      filePattern: '{module}.h',
      outputDir: 'include',
      content: '{{#each values}}{{this}}{{/each}}',
    });
    expect(await engine.generate('test', { module: 'Dem', values: ['<', '"'] })).toEqual({
      filename: 'Dem.h',
      path: 'include/Dem.h',
      content: '<"',
    });
    engine.registerTemplate({ name: 'empty', filePattern: 'empty.h', content: '' });
    expect((await engine.generate('empty', {})).content).toBe('');
    await expect(engine.generate('missing', {})).rejects.toThrow('Template not found: missing');
  });

  it('generates complete recursive data, decimal integers and quoted/escaped strings', async () => {
    const { module, config, find } = synthFixture();
    manager.setParameterValue(find('DemDTC'), 'syn-dtc-severity', 'DEM_SEVERITY_NO_SEVERITY');
    manager.setParameterValue(find('DemDTC'), 'syn-dtc-value', 0x123456);
    manager.setParameterValue(find('DemDTC'), 'syn-dtc-j1939', 'quote" slash\\ line\n\u0001f');
    const generator = new CGenerator();
    const header = await generator.generateHeader(config, module);
    const output = await generator.generateSource(config, module);
    expect(header.filename).toBe('Dem_Cfg.h');
    expect(output.filename).toBe('Dem_PBCfg.c');
    expect(header.content).toContain('DEMDTCVALUE 1193046');
    expect(header.content).toContain('DEMDEVERRORDETECT FALSE');
    expect(header.content).toContain('"DEM_SEVERITY_NO_SEVERITY"');
    expect(header.content).not.toMatch(/\{\{|\{module|\{generatedContent/);
    expect(output.content).not.toContain('Dem_ConfigType');
    expect(header.content).toContain('\\001f');
  });

  const compilerAvailable = spawnSync('gcc', ['--version'], { encoding: 'utf8' }).status === 0;
  it.skipIf(!compilerAvailable)(
    'compiles generated DEM and unusual-name C files using gcc -Werror',
    async () => {
      const generator = new CGenerator();
      const directory = resolve('.temp/task-002-c');
      mkdirSync(directory, { recursive: true });
      for (const unusual of [false, true]) {
        const { module, config, find } = synthFixture();
        if (unusual) {
          module.shortName = '9模块-Alpha';
          config.moduleRef = module.shortName;
          config.containers[0].shortName = '配置*/非法-0';
          config.containers[0].subContainers.forEach((item) => {
            item.shortName = '重复 名字';
          });
          manager.setParameterValue(
            find('DemDTC'),
            'syn-dtc-j1939',
            '"\\\n\u0001f??/'
          );
        }
        const header = await generator.generateHeader(config, module);
        const output = await generator.generateSource(config, module);
        const macros = [...header.content.matchAll(/^#define\s+(\S+)/gm)].map((match) => match[1]);
        expect(macros.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))).toBe(true);
        expect(new Set(macros).size).toBe(macros.length);
        writeFileSync(resolve(directory, header.filename), header.content);
        writeFileSync(resolve(directory, output.filename), output.content);
        const compile = spawnSync(
          'gcc',
          [
            '-std=c11',
            '-Wall',
            '-Wextra',
            '-Werror',
            '-pedantic',
            '-fsyntax-only',
            resolve(directory, output.filename),
          ],
          { encoding: 'utf8' }
        );
        expect(compile.error).toBeUndefined();
        expect(compile.status, compile.stderr).toBe(0);
      }
    }
  );
});
