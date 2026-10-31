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
import { DemConstraints } from '../src/core/constraint/DemConstraints';
import { DefinitionConstraints } from '../src/core/constraint/DefinitionConstraints';
import { TemplateEngine } from '../src/core/generator/TemplateEngine';
import { CGenerator } from '../src/core/generator/CGenerator';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';

const source = readFileSync(resolve('bswmd/dem_bswmd.json'), 'utf8');
const parser = new BswmdParser();
const manager = new ConfigInstanceManager();

function fixture() {
  const module = parser.parseFromJson(source);
  const config = manager.createFromBswmd(module);
  // Scenarios below explicitly opt into these optional containers; empty configs no longer do.
  for (const definition of module.containers[0].subContainers) {
    manager.addContainerInstance(config, config.containers[0].uuid, definition.uuid);
  }
  const find = (name: string) => {
    const entry = collectContainers(config, module).find(
      (item) => item.definition.shortName === name
    );
    if (!entry) throw new Error(`Missing fixture ${name}`);
    return entry.container;
  };
  const engine = new ConstraintEngine();
  engine.registerRules(DemConstraints);
  return { module, config, find, engine };
}
afterEach(() => vi.unstubAllGlobals());

describe('BSWMD parser and loader', () => {
  it('parses all seven listed container definitions, defaults and the aging reference', () => {
    const module = parser.parseFromJson(source);
    expect(indexDefinitions(module).size).toBe(7);
    expect(module.containers[0].subContainers).toHaveLength(6);
    const attributes = module.containers[0].subContainers[1];
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
    expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow(
      /subContainers\[0\].*DemDTC.*uuid/
    );
  });

  it.each(['null', '[]', '{"shortName":"Dem","containers":{}}'])(
    'rejects malformed root or array shapes: %s',
    (json) => {
      expect(() => parser.parseFromJson(json)).toThrow('Failed to parse BSWMD JSON');
    }
  );

  it('rejects unsupported parameter types and duplicate definition UUIDs', () => {
    const data = JSON.parse(source) as BswmdModule;
    Reflect.set(data.containers[0].parameters[0], 'type', 'INVALID');
    expect(() => parser.parseFromJson(JSON.stringify(data))).toThrow('type');
    data.containers[0].parameters = [];
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
    expect(loader.getModule('Dem')?.version).toBe('4.2.2');
    expect(loader.getAllModules()).toHaveLength(1);
    fetch.mockResolvedValue(new Response('', { status: 404 }));
    await expect(loader.loadFromUrl('/missing.json')).rejects.toThrow('404');
    expect(loader.listModules()).toEqual(['Dem']);
    loader.clearCache();
    expect(loader.listModules()).toEqual([]);
  });
});

describe('configuration instances and constraints', () => {
  it('starts with zero optional children, then adds and removes one by definition', () => {
    const module = parser.parseFromJson(source);
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    expect(root.subContainers).toHaveLength(0);
    const engine = new ConstraintEngine();
    engine.registerRules([...DefinitionConstraints, ...DemConstraints]);
    expect(engine.validate(config, module)).toEqual([]);
    config.lastModified = 0;
    const dtc = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
    expect(root.subContainers).toEqual([dtc]);
    expect(dtc.definitionRef).toBe('ecuc-dem-dtc-def');
    expect(dtc.parameters.get('ecuc-dem-dtc-value')).toMatchObject({
      value: 1,
      isConfigured: false,
    });
    expect(config.lastModified).toBeGreaterThan(0);
    config.lastModified = 0;
    expect(manager.removeContainerInstance(config, dtc.uuid)).toBe(dtc);
    expect(root.subContainers).toHaveLength(0);
    expect(config.lastModified).toBeGreaterThan(0);
  });

  it('adds multiple DTCs with unique identities and names even after a deletion', () => {
    const module = parser.parseFromJson(source);
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const first = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
    const second = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
    const third = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
    manager.setParameterValue(first, 'ecuc-dem-dtc-value', 123);
    expect(second.parameters.get('ecuc-dem-dtc-value')?.value).toBe(1);
    expect(new Set([first.uuid, second.uuid, third.uuid]).size).toBe(3);
    manager.removeContainerInstance(config, second.uuid);
    const replacement = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
    expect(replacement.uuid).not.toBe(second.uuid);
    expect(new Set(root.subContainers.map((item) => item.shortName)).size).toBe(3);
    const engine = new ConstraintEngine();
    engine.registerRules(DemConstraints);
    expect(
      engine.validate(config, module).filter((item) => item.ruleId === 'DEM-001')
    ).toHaveLength(2);
  });

  it('enforces sibling bounds and parent definitions without mutating failed operations', () => {
    const module = parser.parseFromJson(source);
    const dtcDefinition = module.containers[0].subContainers[0];
    dtcDefinition.multiplicity = { lower: 1, upper: 2 };
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const first = root.subContainers[0];
    expect(root.subContainers).toHaveLength(1);
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
    expect(root.subContainers).toEqual([first]);
  });

  it('supports root containers, zero upper bounds and a restored config with supplied definitions', () => {
    const module = parser.parseFromJson(source);
    module.containers[0].multiplicity = { lower: 0, upper: 2 };
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
    const module = parser.parseFromJson(source);
    const dtcDefinition = module.containers[0].subContainers[0];
    const cycleDefinition = module.containers[0].subContainers.pop()!;
    cycleDefinition.multiplicity = { lower: 2, upper: 3 };
    dtcDefinition.subContainers = [cycleDefinition];
    const config = manager.createFromBswmd(module);
    const root = config.containers[0];
    const dtc = manager.addContainerInstance(config, root.uuid, dtcDefinition.uuid);
    expect(dtc.subContainers).toHaveLength(2);
    expect(dtc.subContainers[0].parameters.get('ecuc-dem-opcycle-type')?.value).toBe(
      'DEM_OPCYC_IGNITION'
    );
    const cycle = manager.addContainerInstance(config, dtc.uuid, cycleDefinition.uuid);
    expect(dtc.subContainers).toHaveLength(3);
    manager.removeContainerInstance(config, cycle.uuid);
    expect(dtc.subContainers).toHaveLength(2);
    manager.removeContainerInstance(config, dtc.uuid);
    expect(root.subContainers).toHaveLength(0);
    expect(manager.findContainer(config, dtc.subContainers[0].uuid)).toBeNull();
  });

  it('recursively creates instances, preserves definitions, and updates values and references', () => {
    const { module } = fixture();
    const parent = module.containers[0].subContainers[0];
    parent.subContainers.push(module.containers[0].subContainers.pop()!);
    for (const definition of indexDefinitions(module).values()) definition.multiplicity.lower = 1;
    const config = manager.createFromBswmd(module);
    const entries = collectContainers(config, module);
    expect(entries).toHaveLength(7);
    expect(new Set(entries.map((entry) => entry.container.uuid)).size).toBe(7);
    const nested = config.containers[0].subContainers[0].subContainers[0];
    expect(manager.findContainer(config, nested.uuid)).toBe(nested);
    expect(manager.findContainer(config, 'missing')).toBeNull();
    const dtc = config.containers[0].subContainers[0];
    expect(dtc.parameters.get('ecuc-dem-dtc-value')).toMatchObject({
      value: 1,
      definitionRef: 'ecuc-dem-dtc-value',
      isConfigured: false,
    });
    manager.setParameterValue(dtc, 'ecuc-dem-dtc-value', 0x123456);
    manager.setReferenceTarget(dtc, 'ecuc-dem-dtc-attributes-ref', nested.uuid);
    expect(dtc.parameters.get('ecuc-dem-dtc-value')?.isConfigured).toBe(true);
    expect(dtc.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(nested.uuid);
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
      containerUuid: second.subContainers[0].uuid,
    });
  });

  it.each([0, 16777216, 1.5, NaN, Infinity, '1', undefined])(
    'rejects invalid DTC value %s',
    (value) => {
      const { module, config, find, engine } = fixture();
      manager.setParameterValue(find('DemDTC'), 'ecuc-dem-dtc-value', value);
      expect(
        engine.validate(config, module).filter((item) => item.ruleId === 'DEM-002')
      ).toHaveLength(1);
    }
  );

  it('validates threshold signs and event ID bounds/uniqueness', () => {
    const { module, config, find, engine } = fixture();
    manager.setParameterValue(
      find('DemDebounceCounterBasedClass'),
      'ecuc-dem-debounce-counter-failed-threshold',
      0
    );
    manager.setParameterValue(
      find('DemDebounceCounterBasedClass'),
      'ecuc-dem-debounce-counter-passed-threshold',
      0
    );
    manager.setParameterValue(find('DemEventParameter'), 'ecuc-dem-event-id', 65536);
    expect(
      engine.validate(config, module).filter((item) => item.ruleId === 'DEM-003')
    ).toHaveLength(2);
    expect(engine.validate(config, module).some((item) => item.ruleId === 'DEM-006')).toBe(true);
    manager.setParameterValue(find('DemEventParameter'), 'ecuc-dem-event-id', 1);
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
    manager.setParameterValue(attributes, 'ecuc-dem-attr-aging-allowed', true);
    expect(check()).toHaveLength(1);
    manager.setReferenceTarget(attributes, 'ecuc-dem-attr-aging-cycleref', find('DemDTC').uuid);
    expect(check()).toHaveLength(1);
    manager.setReferenceTarget(
      attributes,
      'ecuc-dem-attr-aging-cycleref',
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
        throw 'failure';
      },
    });
    engine.registerRule({
      id: 'after',
      name: 'after',
      scope: 'MODULE',
      severity: 'INFO',
      check: () => [{ ruleId: 'after', severity: 'INFO', path: '', message: 'still runs' }],
    });
    expect(engine.validate(config, module)).toEqual([
      expect.objectContaining({
        ruleId: 'broken',
        severity: 'ERROR',
        message: 'Rule execution failed: failure',
      }),
      expect.objectContaining({ ruleId: 'after', message: 'still runs' }),
    ]);
    engine.registerRule({ ...engine.getRule('after')!, check: () => [] });
    expect(engine.getRules()).toHaveLength(2);
    expect(engine.unregisterRule('broken')).toBe(true);
    expect(engine.unregisterRule('broken')).toBe(false);
    expect(engine.validate(config, module)).toEqual([]);
    engine.clearRules();
    expect(engine.getRules()).toEqual([]);
  });

  it('validates required references, numeric bounds and enum choices from definitions', () => {
    const { module, config, find } = fixture();
    const engine = new ConstraintEngine();
    engine.registerRules(DefinitionConstraints);
    expect(engine.validate(config, module)).toEqual([
      expect.objectContaining({ definitionRef: 'ecuc-dem-dtc-attributes-ref' }),
    ]);
    manager.setReferenceTarget(
      find('DemDTC'),
      'ecuc-dem-dtc-attributes-ref',
      find('DemDTCAttributes').uuid
    );
    expect(engine.validate(config, module)).toEqual([]);
    manager.setParameterValue(find('DemDTC'), 'ecuc-dem-dtc-severity', 'INVALID');
    manager.setParameterValue(find('DemDTC'), 'ecuc-dem-dtc-functional-unit', 256);
    expect(engine.validate(config, module)).toHaveLength(2);
  });

  it('uses definition names instead of hardcoded UUIDs or two-level assumptions', () => {
    const module = parser.parseFromJson(source.split('ecuc-dem-').join('new-definition-'));
    const root = module.containers[0];
    root.subContainers = [
      {
        uuid: 'wrapper',
        shortName: 'Wrapper',
        multiplicity: { lower: 1, upper: 1 },
        parameters: [],
        references: [],
        subContainers: root.subContainers,
      },
    ];
    const config = manager.createFromBswmd(module);
    manager.addContainerInstance(
      config,
      config.containers[0].subContainers[0].uuid,
      'new-definition-dtc-def'
    );
    const dtc = collectContainers(config, module).find(
      (entry) => entry.definition.shortName === 'DemDTC'
    )!.container;
    manager.setParameterValue(dtc, 'new-definition-dtc-value', 0);
    const engine = new ConstraintEngine();
    engine.registerRules(DemConstraints);
    expect(engine.validate(config, module)).toEqual([
      expect.objectContaining({
        ruleId: 'DEM-002',
        path: 'DemConfigSet/Wrapper/DemDTC/DemDtcValue',
      }),
    ]);
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
    const { module, config, find } = fixture();
    manager.setParameterValue(find('DemDTC'), 'ecuc-dem-dtc-value', 0x123456);
    manager.setParameterValue(
      find('DemDTC'),
      'ecuc-dem-dtc-j1939-node-ref',
      'quote" slash\\ line\n\u0001f'
    );
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
        const { module, config, find } = fixture();
        if (unusual) {
          module.shortName = '9模块-Alpha';
          config.moduleRef = module.shortName;
          config.containers[0].shortName = '配置*/非法-0';
          config.containers[0].subContainers.forEach((item) => {
            item.shortName = '重复 名字';
          });
          manager.setParameterValue(
            find('DemDTC'),
            'ecuc-dem-dtc-j1939-node-ref',
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
