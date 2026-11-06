import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import raw from '../bswmd/dem_bswmd.json';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';
import type { ConfigInstance } from '../src/core/config/ConfigTypes';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { cloneContainers } from '../src/core/config/ConfigClone';
import { collectContainers, indexDefinitions } from '../src/core/config/ConfigTraversal';
import { byPath } from './helpers/definitionIndex';
import { exportArxml, importArxml, AUTOSAR_NAMESPACE } from '../src/core/io/Arxml';
import { exportJson, importJson, serializeConfig } from '../src/core/io/ConfigJson';
import { confirmOfficialRequiredReferences } from './helpers/officialDemOutput';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';

function sample() {
  const module: BswmdModule = {
    shortName: 'Example',
    version: '1',
    containers: [
      {
        uuid: 'root',
        shortName: 'Root',
        description: '根描述 & <说明>',
        multiplicity: { lower: 1, upper: 1 },
        subContainers: [],
        parameters: [
          { uuid: 'int', shortName: 'Integer', type: 'INTEGER', defaultValue: 12 },
          { uuid: 'bool', shortName: 'Boolean', type: 'BOOLEAN', defaultValue: true },
          { uuid: 'str', shortName: 'String', type: 'STRING', defaultValue: 'suggestion' },
        ].map((p) => ({
          ...p,
          type: p.type as 'INTEGER' | 'BOOLEAN' | 'STRING',
          description: `${p.shortName} 的说明`,
          configClass: 'PRE_COMPILE',
          isOptional: true,
        })),
        references: [
          { uuid: 'ref', shortName: 'Self', isOptional: true, destinationContainerType: 'Root' },
        ],
      },
    ],
  };
  const manager = new ConfigInstanceManager([module]),
    config = manager.createFromBswmd(module);
  config.name = '  中文配置 & 名称  ';
  config.createdAt = 0;
  config.lastModified = 1700000000123;
  return { module, manager, config, root: config.containers[0], definition: module.containers[0] };
}
function doc(xml: string): Document {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  expect(parsed.querySelector('parsererror')).toBeNull();
  return parsed;
}
function flags(config: ConfigInstance, module: BswmdModule) {
  return Object.fromEntries(
    collectContainers(config, module).flatMap(({ container, path }) =>
      [...container.parameters.values(), ...container.references.values()].map((field) => [
        `${path}/${field.definitionRef}`,
        field.isConfigured,
      ])
    )
  );
}
afterEach(() => vi.restoreAllMocks());

describe('TASK-008 explicit ECUC configuration semantics', () => {
  it('A1/A4/A5: all untouched suggestions stay absent, false, described and timestamp-stable', () => {
    const { module, config } = sample();
    const before = exportJson(config),
      xml = exportArxml(config, module);
    const document = doc(xml);
    expect(document.documentElement.namespaceURI).toBe(AUTOSAR_NAMESPACE);
    expect(
      document.querySelectorAll(
        'ECUC-NUMERICAL-PARAM-VALUE, ECUC-TEXTUAL-PARAM-VALUE, ECUC-REFERENCE-VALUE'
      )
    ).toHaveLength(0);
    expect(document.querySelectorAll('VALUE')).toHaveLength(0);
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    const copy = importArxml(xml, [module]);
    expect(copy).toEqual(config);
    expect(flags(copy, module)).toEqual(flags(config, module));
    expect(Object.values(flags(copy, module)).every((flag) => flag === false)).toBe(true);
    expect(exportJson(config)).toBe(before);
  });
  it('A1: configured 0, false and empty string are all values, never mistaken for absence', () => {
    const { config, module, manager, root } = sample();
    for (const [id, value] of [
      ['int', 0],
      ['bool', false],
      ['str', ''],
    ] as const)
      manager.setParameterValue(root, id, value);
    const xml = exportArxml(config, module);
    expect([...doc(xml).querySelectorAll('VALUE')].map((node) => node.textContent)).toEqual([
      '0',
      'false',
      '',
    ]);
    expect(importArxml(xml, [module])).toEqual(config);
  });
  it.each([true, false])(
    'A3: disabled optional with isConfigured=%s remains omitted and retains its state',
    (isConfigured) => {
      const { config, module, root } = sample();
      Object.assign(root.parameters.get('str')!, { value: undefined, isConfigured });
      const xml = exportArxml(config, module);
      expect(doc(xml).querySelectorAll('ECUC-TEXTUAL-PARAM-VALUE')).toHaveLength(0);
      expect(importArxml(xml, [module])).toEqual(config);
    }
  );
  it('A1: an unconfigured reference with a cached target is not emitted or activated on import', () => {
    const { config, module, root } = sample();
    root.references.get('ref')!.targetUuid = root.uuid;
    const xml = exportArxml(config, module);
    expect(doc(xml).querySelectorAll('ECUC-REFERENCE-VALUE')).toHaveLength(0);
    expect(flags(importArxml(xml, [module]), module)).toEqual(flags(config, module));
    expect(importArxml(xml, [module]).containers[0].references.get('ref')?.targetUuid).toBe('');
  });
  it('A1: selected references retain their target and flag, while clearing resets the flag', () => {
    const { config, module, root, manager } = sample();
    manager.setReferenceTarget(root, 'ref', root.uuid);
    const xml = exportArxml(config, module);
    expect(doc(xml).querySelectorAll('ECUC-REFERENCE-VALUE')).toHaveLength(1);
    expect(importArxml(xml, [module])).toEqual(config);
    manager.setReferenceTarget(root, 'ref', '');
    expect(root.references.get('ref')?.isConfigured).toBe(false);
    expect(importArxml(exportArxml(config, module), [module])).toEqual(config);
  });
  it('A3: a legacy explicitly cleared optional reference retains its flag without a VALUE-REF', () => {
    const { config, module, root } = sample();
    root.references.get('ref')!.isConfigured = true;
    const xml = exportArxml(config, module);
    expect(doc(xml).querySelectorAll('VALUE-REF')).toHaveLength(0);
    expect(importArxml(xml, [module])).toEqual(config);
  });
  it('A2: required defaults are rejected together with paths, before changing the source', () => {
    const { config, module, definition } = sample();
    definition.parameters[0].isOptional = false;
    definition.parameters[1].isOptional = false;
    definition.references[0].isOptional = false;
    const before = exportJson(config);
    expect(() => exportArxml(config, module)).toThrow(/Root\/Integer[\s\S]*Root\/Boolean/);
    expect(exportJson(config)).toBe(before);
  });
  it.each(['missing', 'disabled', 'suggested'] as const)(
    'A2: required %s parameter cannot bypass export validation',
    (state) => {
      const { config, module, definition, root, manager } = sample();
      definition.parameters[0].isOptional = false;
      if (state === 'missing') root.parameters.delete('int');
      if (state === 'disabled') manager.setParameterValue(root, 'int', undefined);
      expect(() => exportArxml(config, module)).toThrow('Root/Integer');
    }
  );
  it('A2: explicitly confirming a required default permits it without confirming other suggestions', () => {
    const { config, module, root, manager, definition } = sample();
    definition.parameters[0].isOptional = false;
    manager.setParameterValue(root, 'int', 12);
    const xml = exportArxml(config, module);
    expect(doc(xml).querySelectorAll('VALUE')).toHaveLength(1);
    expect(flags(importArxml(xml, [module]), module)).toEqual(flags(config, module));
  });
  it('A4: no DESC falls back to BSWMD for both containers and parameters', () => {
    const { config, module, root, manager } = sample();
    manager.setParameterValue(root, 'str', 'configured');
    const xml = exportArxml(config, module).replace(/<DESC>[\s\S]*?<\/DESC>/g, '');
    expect(importArxml(xml, [module])).toEqual(config);
  });
  it('A4: explicit empty/escaped container descriptions override BSWMD and survive another round trip', () => {
    const { config, module, root } = sample();
    for (const description of ['', '  <图> & "说明"\n末行  ']) {
      root.description = description;
      expect(importArxml(exportArxml(config, module), [module]).containers[0].description).toBe(
        description
      );
    }
  });
  it('A5: repeated round trips retain distinct timestamps including zero, even when the clock advances', () => {
    const { config, module } = sample();
    vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
    let copy = config;
    for (let i = 0; i < 3; i++) copy = importArxml(exportArxml(copy, module), [module]);
    expect(copy.createdAt).toBe(0);
    expect(copy.lastModified).toBe(1700000000123);
  });
  it('A4: parameter DESC from an external file survives subsequent export, including empty overrides', () => {
    const { config, module, root, manager } = sample();
    manager.setParameterValue(root, 'str', 'text');
    const source = exportArxml(config, module).replace(
      /(<ECUC-TEXTUAL-PARAM-VALUE[^>]*>)/,
      '$1<DESC><L-2 L="EN">Custom &amp; description</L-2></DESC>'
    );
    const imported = importArxml(source, [module]);
    expect(imported.containers[0].parameters.get('str')?.description).toBe('Custom & description');
    expect(importArxml(exportArxml(imported, module), [module])).toEqual(imported);
    imported.containers[0].parameters.get('int')!.description = '';
    expect(importArxml(exportArxml(imported, module), [module])).toEqual(imported);
  });
  it('imports ordinary third-party ARXML without editor SDGs as unconfigured and assigns an initial timestamp only once', () => {
    const { config, module } = sample();
    // TASK-021: metadata-free files use the documented 4.4.0 baseline.
    module.version = config.version = '4.4.0';
    const xml = exportArxml(config, module).replace(/<ADMIN-DATA>[\s\S]*?<\/ADMIN-DATA>/g, '');
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    const copy = importArxml(xml, [module]);
    expect(copy.createdAt).toBe(12345);
    expect(copy.lastModified).toBe(12345);
    expect(flags(copy, module)).toEqual(flags(config, module));
  });
  it.each(['-1', 'NaN', '1.5', '9007199254740992'])(
    'rejects corrupt timestamp %s instead of silently replacing it',
    (value) => {
      const { config, module } = sample();
      const xml = exportArxml(config, module).replace(
        '<SD GID="createdAt">0</SD>',
        `<SD GID="createdAt">${value}</SD>`
      );
      expect(() => importArxml(xml, [module])).toThrow('createdAt');
    }
  );
  it('rejects contradictory editor disabled markers over an actual ECUC value', () => {
    const { config, module, root } = sample();
    Object.assign(root.parameters.get('str')!, { value: undefined, isConfigured: true });
    const xml = exportArxml(config, module).replace(
      '<PARAMETER-VALUES>',
      '<PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF>/AUTOSAR/EcucDefs/Example/Root/String</DEFINITION-REF><VALUE>actual</VALUE></ECUC-TEXTUAL-PARAM-VALUE>'
    );
    expect(() => importArxml(xml, [module])).toThrow('禁用参数同时包含 VALUE');
  });
  it('migrates legacy JSON reference flags and descriptions, then preserves explicit false flags', () => {
    const { config, module, root, manager } = sample();
    manager.setReferenceTarget(root, 'ref', root.uuid);
    const legacy = exportJson(config)
      .replace(/\s*"isConfigured": true,?/g, '')
      .replace(/,\s*}/g, '}')
      .replace(/\s*"description": "[^"\n]*",?/g, '')
      .replace(/,\s*}/g, '}');
    const copy = importJson(legacy, [module]);
    expect(copy.containers[0].references.get('ref')?.isConfigured).toBe(true);
    expect(copy.containers[0].description).toBe(module.containers[0].description);
    expect(copy.containers[0].parameters.get('int')?.description).toBe(
      module.containers[0].parameters[0].description
    );
    copy.containers[0].references.get('ref')!.isConfigured = false;
    expect(importJson(exportJson(copy), [module])).toEqual(copy);
  });
  it('clears the configured flag when a cloned subtree loses an external target', () => {
    const { root, manager } = sample();
    manager.setReferenceTarget(root, 'ref', 'outside');
    expect(cloneContainers([root])[0].references.get('ref')).toMatchObject({
      targetUuid: '',
      isConfigured: false,
    });
  });
});

describe('official module regressions', () => {
  it('Dem 4.4.0: one configured DTC field still rejects the other mandatory suggestions', () => {
    const module = new BswmdParser().parseFromJson(JSON.stringify(raw));
    const manager = new ConfigInstanceManager([module]),
      config = manager.createFromBswmd(module);
    expect(indexDefinitions(module).size).toBe(67);
    const root = config.containers.find((c) => c.definitionRef === byPath('DemConfigSet'))!;
    const dtc = manager.addContainerInstance(config, root.uuid, byPath('DemConfigSet/DemDTC'));
    const choice = collectContainers(config, module).find((e) => e.definition.choice)!;
    manager.selectChoice(
      config,
      choice.container.uuid,
      byPath('DemConfigSet/DemEventParameter/DemDebounceAlgorithmClass/DemDebounceMonitorInternal')
    );
    manager.setParameterValue(dtc, byPath('DemConfigSet/DemDTC/DemDtcValue'), 42);
    expect(dtc.parameters.size).toBe(5);
    expect(
      collectContainers(config, module).flatMap((e) => [...e.container.parameters.values()])
    ).toHaveLength(55); // Official required tree (50) + one DTC (5), not the old 31-field mock.
    const configured = Object.values(flags(config, module)).filter(Boolean);
    expect(configured).toHaveLength(1);
    // Severity is optional in the official release; every actually required field must be listed.
    for (const entry of collectContainers(config, module))
      for (const p of entry.definition.parameters.filter((p) => !p.isOptional))
        expect(() => exportArxml(config, module)).toThrow(`${entry.path}/${p.shortName}`);
  });
  it('Dem 4.4.0: explicit false survives output after all other required fields are confirmed', () => {
    const module = new BswmdParser().parseFromJson(JSON.stringify(raw));
    const manager = new ConfigInstanceManager([module]),
      config = manager.createFromBswmd(module);
    const entries = collectContainers(config, module);
    const general = entries.find((e) => e.definition.shortName === 'DemGeneral')!;
    const field = general.definition.parameters.find((p) => p.shortName === 'DemDevErrorDetect')!;
    manager.setParameterValue(general.container, field.uuid, false);
    expect(Object.values(flags(config, module)).filter(Boolean)).toHaveLength(1);
    const choice = entries.find((e) => e.definition.choice)!;
    manager.selectChoice(
      config,
      choice.container.uuid,
      byPath('DemConfigSet/DemEventParameter/DemDebounceAlgorithmClass/DemDebounceMonitorInternal')
    );
    expect(() => exportArxml(config, module)).toThrow('必填项未配置');
    let requiredCount = 0;
    for (const entry of collectContainers(config, module)) {
      for (const p of entry.definition.parameters.filter((p) => !p.isOptional)) {
        manager.setParameterValue(
          entry.container,
          p.uuid,
          entry.container.parameters.get(p.uuid)!.value
        );
        requiredCount++;
      }
    }
    confirmOfficialRequiredReferences(config, module);
    const xml = exportArxml(config, module),
      document = doc(xml);
    expect(document.querySelectorAll('VALUE')).toHaveLength(requiredCount);
    const expectedPath = '/AUTOSAR/EcucDefs/Dem/DemGeneral/DemDevErrorDetect';
    expect(
      raw.containers
        .find((c) => c.shortName === 'DemGeneral')!
        .parameters.find((p) => p.shortName === 'DemDevErrorDetect')!.definitionPath
    ).toBe(expectedPath);
    const emitted = [...document.querySelectorAll('ECUC-NUMERICAL-PARAM-VALUE')].find(
      (node) => node.querySelector('DEFINITION-REF')?.textContent === expectedPath
    );
    expect(emitted?.querySelector('VALUE')?.textContent).toBe('false');
    const copy = importArxml(xml, [module]);
    expect(flags(copy, module)).toEqual(flags(config, module));
    expect(copy.containers).toEqual(config.containers);
    expect(copy.createdAt).toBe(config.createdAt);
    expect(copy.lastModified).toBe(config.lastModified);
  });
  it('CanIf: 45 suggestions require confirmation and mandatory local/external references block output without blocking JSON', () => {
    const module = importEcucModuleArxml(
      readFileSync('tests/fixtures/ecuc-canif.arxml', 'utf8'),
      'CanIf'
    );
    const manager = new ConfigInstanceManager([module]),
      config = manager.createFromBswmd(module);
    const entries = collectContainers(config, module);
    expect(entries.flatMap((e) => [...e.container.parameters.values()])).toHaveLength(45);
    for (const entry of entries) {
      for (const def of entry.definition.parameters.filter((p) => !p.isOptional))
        expect(() => exportArxml(config, module)).toThrow(`${entry.path}/${def.shortName}`);
    }
    const count = entries.reduce(
      (sum, e) => sum + e.definition.parameters.filter((p) => !p.isOptional).length,
      0
    );
    for (const entry of entries)
      for (const def of entry.definition.parameters.filter((p) => !p.isOptional))
        manager.setParameterValue(
          entry.container,
          def.uuid,
          entry.container.parameters.get(def.uuid)!.value
        );
    // TASK-014 v3 A4: confirming parameters alone cannot satisfy mandatory references.
    const check = evaluateOutputReadiness(config, module);
    expect(check.ready).toBe(false);
    expect(check.issues).toHaveLength(3);
    for (const name of ['CanIfCtrlDrvNameRef', 'CanIfCtrlCanCtrlRef']) {
      const issue = check.issues.find((item) => item.path.endsWith('/' + name))!;
      expect(issue.reason).toContain('目标跨模块（本期不支持）');
      expect(() => exportArxml(config, module)).toThrow(name);
    }
    const localIssue = check.issues.find((item) =>
      item.path.endsWith('/CanIfCtrlDrvInitHohConfigRef')
    )!;
    expect(localIssue.reason).toContain('必填引用未配置');
    expect(localIssue.reason).not.toContain('跨模块');
    expect(() => exportArxml(config, module)).toThrow('CanIfCtrlDrvInitHohConfigRef');
    const copy = importJson(exportJson(config), [module]);
    expect(Object.values(flags(copy, module)).filter(Boolean)).toHaveLength(count);
    expect(flags(copy, module)).toEqual(flags(config, module));
    expect(copy.containers).toEqual(config.containers);
    expect(serializeConfig(copy).createdAt).toBe(config.createdAt);
    expect(copy.lastModified).toBe(config.lastModified);
    expect(new Set(collectContainers(copy, module).map((e) => e.container.uuid)).size).toBe(
      entries.length
    );
    console.info(
      `CanIf: 45 suggestions blocked; ${count} required parameters confirmed; three required references block output; JSON flags/timestamps/descriptions equal`
    );
  });
});
