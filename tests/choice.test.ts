import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers, indexDefinitions } from '../src/core/config/ConfigTraversal';
import { planRequiredDefaults } from '../src/core/config/RequiredDefaults';
import { ConstraintEngine } from '../src/core/constraint/ConstraintEngine';
import { DefinitionConstraints } from '../src/core/constraint/DefinitionConstraints';
import { exportArxml, importArxml, AUTOSAR_NAMESPACE } from '../src/core/io/Arxml';
import { exportJson, importJson } from '../src/core/io/ConfigJson';
import { planImport } from '../src/core/io/ImportPlan';

function nvm() {
  const module = importEcucModuleArxml(
    readFileSync('tests/fixtures/ecuc-nvm.arxml', 'utf8'),
    'NvM'
  );
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  const group = collectContainers(config, module).find((entry) => entry.definition.choice)!;
  return { module, manager, config, group };
}
function sample() {
  const candidate = (uuid: string): BswmdContainer => ({
    uuid,
    shortName: uuid,
    multiplicity: { lower: 1, upper: 1 },
    parameters: [
      {
        uuid: uuid + '-p',
        shortName: 'Value',
        type: 'INTEGER',
        configClass: 'PRE_COMPILE',
        defaultValue: 7,
        isOptional: true,
      },
    ],
    references: [
      { uuid: uuid + '-r', shortName: 'Self', isOptional: true, destinationContainerType: uuid },
    ],
    subContainers: [],
  });
  const module: BswmdModule = {
    shortName: 'ExampleChoice',
    version: '1',
    containers: [
      {
        uuid: 'group',
        shortName: 'Group',
        multiplicity: { lower: 1, upper: 2 },
        parameters: [],
        references: [],
        choice: { candidateRefs: ['A', 'B'] },
        subContainers: [candidate('A'), candidate('B')],
      },
    ],
  };
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  return { module, manager, config, group: config.containers[0] };
}

describe('TASK-009 choice metadata and lifecycle', () => {
  it('retains the two inline candidates, paths, multiplicities and references without an export blocker', () => {
    const { module, group } = nvm();
    expect(group.definition.shortName).toBe('NvMTargetBlockReference');
    expect(group.definition.choice?.candidateRefs).toEqual(
      group.definition.subContainers.map((d) => d.uuid)
    );
    expect(group.definition.subContainers.map((d) => d.shortName)).toEqual([
      'NvMEaRef',
      'NvMFeeRef',
    ]);
    for (const candidate of group.definition.subContainers) {
      expect(candidate.definitionPath).toBe(
        `${group.definition.definitionPath}/${candidate.shortName}`
      );
      expect(candidate.multiplicity).toEqual({ lower: 0, upper: 1 });
      expect(candidate.references).toHaveLength(1);
    }
    expect(module.arxmlExportBlockers).toEqual([]);
    expect(group.container.subContainers).toHaveLength(0);
  });
  it('does not instantiate all mandatory alternatives and validates an unselected group', () => {
    const { config, module, group } = sample();
    expect(group.subContainers).toHaveLength(0);
    const engine = new ConstraintEngine();
    engine.registerRules(DefinitionConstraints);
    expect(engine.validate(config, module).some((v) => v.message.includes('CHOICE 尚未选择'))).toBe(
      true
    );
    expect(() => exportArxml(config, module)).toThrow('CHOICE 尚未选择');
  });
  it('enforces exclusivity in add, clone, removal and switching; rejected operations do not mutate', () => {
    const { config, manager, group } = sample();
    const a = manager.addContainerInstance(config, group.uuid, 'A');
    const before = exportJson(config);
    expect(
      manager.getAddOptions(config, group.uuid).every((o) => o.disabledReason?.includes('CHOICE'))
    ).toBe(true);
    expect(() => manager.addContainerInstance(config, group.uuid, 'B')).toThrow('CHOICE');
    expect(() => manager.cloneContainerInstance(config, a.uuid)).toThrow('CHOICE');
    expect(() => manager.removeContainerInstance(config, a.uuid)).toThrow('CHOICE');
    expect(() => manager.selectChoice(config, group.uuid, 'unknown')).toThrow('CHOICE');
    expect(exportJson(config)).toBe(before);
    expect(manager.selectChoice(config, group.uuid, 'A')).toBe(a);
    const b = manager.selectChoice(config, group.uuid, 'B');
    expect(group.subContainers).toEqual([b]);
    expect(manager.findContainer(config, a.uuid)).toBeNull();
  });
  it('supports independent selections in repeated groups and never shares subtree identities', () => {
    const { config, manager, group, module } = sample();
    const second = manager.addContainerInstance(config, null, 'group');
    manager.selectChoice(config, group.uuid, 'A');
    manager.selectChoice(config, second.uuid, 'B');
    expect(group.subContainers[0].uuid).not.toBe(second.subContainers[0].uuid);
    expect(importArxml(exportArxml(config, module), [module]).containers).toEqual(
      config.containers
    );
  });
  it('retains choice metadata and paths when a definition is loaded from JSON', () => {
    const { module } = nvm();
    const copy = new BswmdParser().parseFromJson(JSON.stringify(module));
    const choice = [...indexDefinitions(copy).values()].find((d) => d.choice)!;
    expect(choice.choice).toEqual(
      [...indexDefinitions(module).values()].find((d) => d.choice)!.choice
    );
    expect(choice.subContainers.every((d) => d.definitionPath?.includes(choice.shortName))).toBe(
      true
    );
  });
  it('rejects dual candidates from JSON or ARXML while leaving incomplete JSON editable', () => {
    const { config, manager, group, module } = sample();
    expect(importJson(exportJson(config), [module]).containers[0].subContainers).toHaveLength(0);
    manager.selectChoice(config, group.uuid, 'A');
    const xmlA = exportArxml(config, module);
    const docA = new DOMParser().parseFromString(xmlA, 'application/xml');
    const aNode = [...docA.querySelectorAll('ECUC-CONTAINER-VALUE')].find(
      (n) => n.querySelector('SHORT-NAME')?.textContent === 'A'
    )!;
    const a = group.subContainers[0];
    manager.selectChoice(config, group.uuid, 'B');
    const xmlB = exportArxml(config, module);
    const docB = new DOMParser().parseFromString(xmlB, 'application/xml');
    docB
      .querySelector('ECUC-CONTAINER-VALUE > SUB-CONTAINERS')!
      .appendChild(docB.importNode(aNode, true));
    expect(() => importArxml(new XMLSerializer().serializeToString(docB), [module])).toThrow(
      'CHOICE'
    );
    group.subContainers.push(a);
    expect(() => importJson(exportJson(config), [module])).toThrow('CHOICE');
    expect(() => exportArxml(config, module)).toThrow('CHOICE');
  });
});

describe('TASK-009 choice values and round trips', () => {
  it.each(['A', 'B'])(
    'round-trips selected %s, custom parameters, UUIDs, references and flags',
    (candidate) => {
      const { config, manager, group, module } = sample();
      config.name = 'choice';
      const child = manager.selectChoice(config, group.uuid, candidate);
      manager.setParameterValue(child, candidate + '-p', 42);
      manager.setReferenceTarget(child, candidate + '-r', child.uuid);
      const xml = exportArxml(config, module);
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.namespaceURI).toBe(AUTOSAR_NAMESPACE);
      expect(doc.querySelector('ECUC-CONTAINER-VALUE > DEFINITION-REF')?.getAttribute('DEST')).toBe(
        'ECUC-CHOICE-CONTAINER-DEF'
      );
      expect(doc.querySelectorAll('ECUC-CONTAINER-VALUE')).toHaveLength(2);
      expect(importArxml(xml, [module])).toEqual(config);
      expect(
        importArxml(xml.replace(/<ADMIN-DATA>[\s\S]*?<\/ADMIN-DATA>/g, ''), [module]).containers
      ).toEqual(config.containers);
    }
  );
  it.each([0, 1])(
    'exports and round-trips actual NvM candidate %s while retaining unset external references',
    (index) => {
      const { config, manager, group, module } = nvm();
      config.name = 'NvM round trip';
      manager.selectChoice(
        config,
        group.container.uuid,
        group.definition.subContainers[index].uuid
      );
      const { assignments, remaining } = planRequiredDefaults(config, module);
      for (const { container, definition } of assignments)
        manager.setParameterValue(container, definition.uuid, definition.defaultValue);
      let manual = 0;
      const entries = collectContainers(config, module);
      for (const { container, definition } of entries) {
        for (const p of definition.parameters.filter((p) => !p.isOptional)) {
          if (container.parameters.get(p.uuid)?.isConfigured) continue;
          // Test-only explicit manual inputs are distinct from the default-confirmation action.
          manager.setParameterValue(container, p.uuid, container.parameters.get(p.uuid)!.value);
          manual++;
        }
      }
      expect(manual).toBe(remaining);
      // This official fixture references only other modules; do not fabricate an in-module target.
      expect(
        entries
          .flatMap((e) => e.definition.references)
          .every((r) => !r.destinationRef?.startsWith('/AUTOSAR/EcucDefs/NvM/'))
      ).toBe(true);
      const xml = exportArxml(config, module);
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.namespaceURI).toBe(AUTOSAR_NAMESPACE);
      const ids = [...doc.querySelectorAll('[UUID]')].map((node) => node.getAttribute('UUID'));
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        [...doc.querySelectorAll('DEFINITION-REF')].every((node) =>
          node.textContent?.startsWith('/AUTOSAR/EcucDefs/NvM')
        )
      ).toBe(true);
      expect(doc.querySelectorAll('DEFINITION-REF[DEST="ECUC-CHOICE-CONTAINER-DEF"]')).toHaveLength(
        1
      );
      expect(importArxml(xml, [module])).toEqual(config);
      console.info(
        `NvM candidate=${group.definition.subContainers[index].shortName}; defaults=${assignments.length}; manual=${manual}; xml=${xml.length}; containers=${entries.length}; roundTrip=equal`
      );
    }
  );
  it('still enforces explicit module export blockers', () => {
    const { config, module } = sample();
    module.arxmlExportBlockers = ['Other unsupported definition semantics'];
    expect(() => exportArxml(config, module)).toThrow('Other unsupported');
  });
  it('previews changed selections as conflicts and overwrites/skips without ever merging alternatives', () => {
    const { config, manager, module, group } = sample();
    manager.selectChoice(config, group.uuid, 'A');
    const incoming = importJson(exportJson(config), [module]);
    manager.selectChoice(incoming, group.uuid, 'B');
    const before = exportJson(config);
    const overwritten = planImport(config, incoming, module, 'overwrite');
    expect(overwritten.conflicts).toContainEqual(
      expect.objectContaining({
        parameter: 'CHOICE 候选（替换原候选配置）',
        projectValue: 'A',
        fileValue: 'B',
      })
    );
    expect(overwritten.result.containers[0].subContainers.map((c) => c.definitionRef)).toEqual([
      'B',
    ]);
    expect(
      planImport(config, incoming, module, 'skip').result.containers[0].subContainers.map(
        (c) => c.definitionRef
      )
    ).toEqual(['A']);
    const renamed = planImport(config, incoming, module, 'rename');
    expect(renamed.result.containers.map((c) => c.subContainers[0].definitionRef)).toEqual([
      'A',
      'B',
    ]);
    expect(exportJson(config)).toBe(before);
    module.containers[0].multiplicity.upper = 1;
    expect(() => planImport(config, incoming, module, 'rename')).toThrow('上限');
  });
});
