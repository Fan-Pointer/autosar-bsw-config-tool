import { describe, expect, it } from 'vitest';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { hydrateConfig, serializeConfig } from '../src/core/io/ConfigJson';
import { ConstraintEngine } from '../src/core/constraint/ConstraintEngine';
import { DefinitionConstraints } from '../src/core/constraint/DefinitionConstraints';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';

/** Minimal module with one multi-value STRING and one bounded multi-value INTEGER (G32). */
function multiModule(): BswmdModule {
  const source = {
    uuid: 'mult-module-def',
    shortName: 'Mult',
    version: 'TEST-MULTI-1',
    definitionPath: '/AUTOSAR/EcucDefs/Mult',
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references: [],
    containers: [
      {
        uuid: 'mult-general-def',
        shortName: 'MultGeneral',
        definitionPath: '/AUTOSAR/EcucDefs/Mult/MultGeneral',
        multiplicity: { lower: 1, upper: 1 },
        description: 'Multi-value fixture container',
        parameters: [
          {
            uuid: 'mult-text-def',
            shortName: 'MultText',
            type: 'STRING',
            multiplicity: { lower: 0, upper: 'unbounded' },
          },
          {
            uuid: 'mult-limit-def',
            shortName: 'MultLimit',
            type: 'INTEGER',
            min: 0,
            max: 100,
            multiplicity: { lower: 0, upper: 3 },
          },
        ],
        references: [],
        subContainers: [],
      },
    ],
  };
  return new BswmdParser().parseFromJson(JSON.stringify(source));
}

function fixture() {
  const module = multiModule();
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  config.name = 'MultSet';
  const general = config.containers[0];
  return { module, manager, config, general };
}

describe('G32 multi-value parameter rows', () => {
  it('adds, edits and removes rows with multiplicity bounds and row-level configuration', () => {
    const { module, manager, general } = fixture();
    const textDef = module.containers[0].parameters.find((p) => p.uuid === 'mult-text-def')!;
    const limitDef = module.containers[0].parameters.find((p) => p.uuid === 'mult-limit-def')!;

    expect(manager.addParameterValueRow(general, textDef.uuid, 'alpha')).toBe(1);
    expect(manager.addParameterValueRow(general, textDef.uuid, 'beta')).toBe(2);
    expect(general.parameters.get(textDef.uuid)!.value).toEqual(['alpha', 'beta']);

    manager.setParameterValueRow(general, textDef.uuid, 1, 'beta2');
    expect(general.parameters.get(textDef.uuid)!.value).toEqual(['alpha', 'beta2']);

    expect(manager.removeParameterValueRow(general, textDef.uuid, 0)).toBe(1);
    expect(general.parameters.get(textDef.uuid)!.value).toEqual(['beta2']);

    // Upper bound 3 for MultLimit: adding a 4th row throws when the caller passes the bound.
    manager.addParameterValueRow(general, limitDef.uuid, 1, 3);
    manager.addParameterValueRow(general, limitDef.uuid, 2, 3);
    manager.addParameterValueRow(general, limitDef.uuid, 3, 3);
    expect(() => manager.addParameterValueRow(general, limitDef.uuid, 4, 3)).toThrow(
      'upper multiplicity 3 reached'
    );
  });

  it('round-trips multi-row values through serialize, hydrate, ARXML and back without loss', () => {
    const { module, manager, config, general } = fixture();
    const textDef = module.containers[0].parameters.find((p) => p.uuid === 'mult-text-def')!;
    manager.addParameterValueRow(general, textDef.uuid, 'first');
    manager.addParameterValueRow(general, textDef.uuid, 'second');
    manager.setParameterValueRow(general, textDef.uuid, 0, 'first-edited');

    const json = serializeConfig(config);
    const restored = hydrateConfig(JSON.parse(JSON.stringify(json)), [module]);
    const restoredRows = restored.containers[0].parameters.get(textDef.uuid)!.value;
    expect(restoredRows).toEqual(['first-edited', 'second']);

    const arxml = exportArxml(restored, module);
    expect((arxml.match(/<VALUE>first-edited<\/VALUE>/g) ?? []).length).toBe(1);
    expect((arxml.match(/<VALUE>second<\/VALUE>/g) ?? []).length).toBe(1);
    const back = importArxml(arxml, [module]);
    expect(back.containers[0].parameters.get(textDef.uuid)!.value).toEqual([
      'first-edited',
      'second',
    ]);
    expect(serializeConfig(back)).toEqual(serializeConfig(restored));
  });

  it('keeps every pre-G32 shape byte-identical: no rows means no array in serialization', () => {
    const { module, config } = fixture();
    const json = serializeConfig(config);
    // Before any row is added: suggestion entries stay scalar (pre-G32 shape, zero diff).
    expect(json.containers[0].parameters).toHaveLength(2);
    expect(json.containers[0].parameters.every((item: { value: unknown }) => !Array.isArray(item.value))).toBe(true);
    const restored = hydrateConfig(JSON.parse(JSON.stringify(json)), [module]);
    expect(serializeConfig(restored)).toEqual(json);
  });

  it('validates every multi-value row and reports the row index in the message', () => {
    const { module, manager, config, general } = fixture();
    const limitDef = module.containers[0].parameters.find((p) => p.uuid === 'mult-limit-def')!;
    manager.addParameterValueRow(general, limitDef.uuid, 5, 3);
    manager.addParameterValueRow(general, limitDef.uuid, 200, 3);
    const engine = new ConstraintEngine();
    engine.registerRules([...DefinitionConstraints]);
    const violations = engine.validate(config, module);
    const ranged = violations.filter((item) => item.definitionRef === limitDef.uuid);
    // Row 0 (value 5) is in range and must NOT be reported; row 1 (200) exceeds max 100.
    expect(ranged).toHaveLength(1);
    expect(ranged[0].message.includes('MultLimit[1]')).toBe(true);
    expect(ranged[0].message).toContain('allowed range: [0, 100]');
  });
});
