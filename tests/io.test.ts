import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import raw from './fixtures/synthetic-dem.json';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { cloneConfiguration } from '../src/core/config/ConfigClone';
import {
  checkImportSize,
  exportJson,
  hydrateConfig,
  importJson,
  MAX_IMPORT_BYTES,
  serializeConfig,
} from '../src/core/io/ConfigJson';
import { AUTOSAR_NAMESPACE, exportArxml, importArxml } from '../src/core/io/Arxml';
import { exportCsv } from '../src/core/io/Csv';
import { planImport } from '../src/core/io/ImportPlan';
import { completeDemArxml } from './helpers/completeDemArxml';

function fixture() {
  const module = new BswmdParser().parseFromJson(JSON.stringify(raw));
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  config.name = '中文配置集';
  const root = config.containers[0];
  for (const definition of module.containers[0].subContainers)
    manager.addContainerInstance(config, root.uuid, definition.uuid);
  const [dtc, attributes, event, , , cycle] = root.subContainers;
  manager.setParameterValue(dtc, 'fixture-dem-dtc-value', 0x1a2b3c);
  manager.setReferenceTarget(dtc, 'fixture-dem-dtc-attributes-ref', attributes.uuid);
  manager.setReferenceTarget(attributes, 'fixture-dem-attr-aging-cycleref', cycle.uuid);
  manager.setReferenceTarget(event, 'fixture-dem-event-dtc-ref', dtc.uuid);
  return { module, manager, config, root, dtc, attributes, event };
}
function arxmlFixture() {
  const result = fixture();
  // A value file now requires explicit choices for mandatory fields, including existing defaults.
  for (const { container, definition } of collectContainers(result.config, result.module))
    for (const parameter of definition.parameters.filter((p) => !p.isOptional))
      result.manager.setParameterValue(
        container,
        parameter.uuid,
        container.parameters.get(parameter.uuid)!.value
      );
  return result;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('lossless JSON import/export', () => {
  it('round-trips every metadata field, UUID, definitionRef, parameter state and reference through a new set', () => {
    const { module, config, root, manager, dtc } = fixture();
    manager.setParameterValue(root, module.containers[0].parameters[0].uuid, undefined);
    manager.setParameterValue(dtc, 'fixture-text-payload', '中文 <节点> & "文本"');
    const restored = importJson(exportJson(config), [module]);
    expect(restored).toEqual(config);
    const result = planImport(null, restored, module);
    expect(result.result).toEqual(config);
    expect(result.addedContainers).toBe(7);
    expect(result.addedParameters).toBe(31);
    for (const entry of collectContainers(config, module)) {
      const copy = collectContainers(result.result, module).find(
        (item) => item.path === entry.path
      )!.container;
      expect(copy).toEqual(entry.container);
      expect(copy.parameters).not.toBe(entry.container.parameters);
    }
    expect(exportJson(result.result)).toBe(exportJson(config));
  });

  it('merges an export into a freshly initialized set with references remapped by path', () => {
    const { module, config, manager } = fixture();
    const empty = manager.createFromBswmd(module);
    const result = planImport(empty, importJson(exportJson(config), [module]), module).result;
    const expected = collectContainers(config, module),
      actual = collectContainers(result, module);
    expect(actual.map((item) => item.path)).toEqual(expected.map((item) => item.path));
    expect(actual.map((item) => [...item.container.parameters])).toEqual(
      expected.map((item) => [...item.container.parameters])
    );
    const relations = (entries: typeof actual) =>
      entries.map((entry) =>
        [...entry.container.references.values()].map(
          (ref) =>
            entries.find((target) => target.container.uuid === ref.targetUuid)?.path ??
            ref.targetUuid
        )
      );
    expect(relations(actual)).toEqual(relations(expected));
  });

  it.each(['null', '[]', '{}', '{broken'])('rejects malformed JSON %s', (text) => {
    expect(() => importJson(text, [])).toThrow();
  });
  it('rejects incompatible module versions and duplicate identities without mutating its source', () => {
    const { config, module } = fixture();
    const snapshot = exportJson(config);
    const data = serializeConfig(config);
    data.containers[0].subContainers[0].uuid = data.containers[0].uuid;
    expect(() => hydrateConfig(data, [module])).toThrow('UUID 重复');
    expect(() => hydrateConfig({ ...data, version: 'wrong' }, [module])).toThrow('未加载 BSWMD');
    expect(exportJson(config)).toBe(snapshot);
  });
  it('rejects wrong value types, duplicate fields and wrong-parent definitions', () => {
    const { config, module } = fixture();
    const data = serializeConfig(config);
    data.containers[0].parameters[0].value = { attack: true };
    expect(() => hydrateConfig(data, [module])).toThrow('参数类型');
    data.containers[0].parameters[0].value = false;
    data.containers[0].parameters.push(data.containers[0].parameters[0]);
    expect(() => hydrateConfig(data, [module])).toThrow('重复');
    data.containers[0].parameters.pop();
    data.containers[0].definitionRef = 'fixture-dem-dtc-def';
    expect(() => hydrateConfig(data, [module])).toThrow('父容器');
  });
  it('accepts a UTF-8 BOM and retains dangling UUID references for existing validation', () => {
    const { config, module, dtc } = fixture();
    dtc.references.get('fixture-dem-dtc-attributes-ref')!.targetUuid = 'deleted-target';
    expect(importJson('\uFEFF' + exportJson(config), [module])).toEqual(config);
  });
});

describe('ARXML structure and security', () => {
  it('uses r4.0, ECUC hierarchy, UUIDs, definition paths, and correct reference paths', () => {
    const { config, module } = arxmlFixture();
    const xml = exportArxml(config, module);
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.documentElement.namespaceURI).toBe(AUTOSAR_NAMESPACE);
    expect(
      document.querySelector(
        'AUTOSAR > AR-PACKAGES > AR-PACKAGE > ELEMENTS > ECUC-MODULE-CONFIGURATION-VALUES'
      )
    ).not.toBeNull();
    const containers = [...document.getElementsByTagName('ECUC-CONTAINER-VALUE')];
    expect(containers).toHaveLength(7);
    expect(containers.every((node) => Boolean(node.getAttribute('UUID')))).toBe(true);
    const parameterNodes = [
      ...document.querySelectorAll('ECUC-NUMERICAL-PARAM-VALUE, ECUC-TEXTUAL-PARAM-VALUE'),
    ];
    expect(parameterNodes).toHaveLength(15);
    expect(
      collectContainers(config, module)
        .flatMap((entry) => [...entry.container.parameters.values()])
        .filter((p) => !p.isConfigured)
    ).toHaveLength(16);
    expect(parameterNodes.every((node) => Boolean(node.getAttribute('UUID')))).toBe(true);
    const uuids = [...document.querySelectorAll('[UUID]')].map((node) => node.getAttribute('UUID'));
    expect(new Set(uuids).size).toBe(uuids.length);
    expect(
      [...document.getElementsByTagName('DEFINITION-REF')].every((node) =>
        node.textContent?.startsWith('/AUTOSAR/EcucDefs/Dem')
      )
    ).toBe(true);
    const restored = importArxml(xml, [module]);
    const actual = collectContainers(restored, module),
      original = collectContainers(config, module);
    expect(actual.map((item) => item.path)).toEqual(original.map((item) => item.path));
    for (let i = 0; i < original.length; i++) {
      expect(
        Object.fromEntries(
          [...actual[i].container.parameters].map(([id, p]) => [id, p.isConfigured])
        )
      ).toEqual(
        Object.fromEntries(
          [...original[i].container.parameters].map(([id, p]) => [id, p.isConfigured])
        )
      );
      expect(
        Object.fromEntries(
          [...actual[i].container.references].map(([id, r]) => [id, r.isConfigured])
        )
      ).toEqual(
        Object.fromEntries(
          [...original[i].container.references].map(([id, r]) => [id, r.isConfigured])
        )
      );
      expect(
        Object.fromEntries(
          [...actual[i].container.parameters.values()].map((p) => [p.definitionRef, p.value])
        )
      ).toEqual(
        Object.fromEntries(
          [...original[i].container.parameters.values()].map((p) => [p.definitionRef, p.value])
        )
      );
      for (const ref of original[i].container.references.values())
        if (ref.targetUuid)
          expect(actual[i].container.references.get(ref.definitionRef)?.targetUuid).toBe(
            ref.targetUuid
          );
    }
  });
  it('escapes and restores text including entities and whitespace without markup injection', () => {
    const { config, module, dtc, manager } = arxmlFixture();
    const value = '  中文 <img src=x> & "quoted" \'single\'\n末行  ';
    manager.setParameterValue(dtc, 'fixture-text-payload', value);
    const xml = exportArxml(config, module);
    expect(xml).not.toContain('<img');
    const restored = importArxml(xml, [module]);
    expect(
      restored.containers[0].subContainers[0].parameters.get('fixture-text-payload')?.value
    ).toBe(value);
  });
  it('accepts namespace-prefixed ARXML and generates missing UUIDs through the common utility', () => {
    const { config, module } = arxmlFixture();
    const xml = exportArxml(config, module)
      .replace(/xmlns=/, 'xmlns:a=')
      .replace(/<(\/?)([A-Z][A-Z-]*)/g, '<$1a:$2')
      .replace(/ UUID="[^"]+"/g, '');
    const imported = importArxml(xml, [module]);
    expect(collectContainers(imported, module)).toHaveLength(7);
    expect(imported.uuid).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('rejects an external file entity before parser invocation, without reading or expanding the secret', () => {
    const attack = fs.readFileSync(resolve('tests/fixtures/external-entity.arxml'), 'utf8');
    const secretPath = resolve('.temp/io-xxe-secret.txt');
    fs.mkdirSync(resolve('.temp'), { recursive: true });
    fs.writeFileSync(secretPath, 'XXE_PRIVATE_SENTINEL_005');
    const source = attack.replace('file:///AUTODEV-XXE-SECRET.txt', pathToFileURL(secretPath).href);
    const read = vi.spyOn(fs, 'readFileSync');
    const parser = vi.spyOn(XMLParser.prototype, 'parse');
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    let result: unknown;
    expect(() => {
      result = importArxml(source, []);
    }).toThrow('禁止 DTD');
    expect(result).toBeUndefined();
    expect(String(result)).not.toContain('XXE_PRIVATE_SENTINEL_005');
    expect(read).not.toHaveBeenCalled();
    expect(parser).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
  it.each([
    '<!DOCTYPE AUTOSAR SYSTEM "https://attacker.invalid/external.dtd"><AUTOSAR/>',
    '<!DOCTYPE AUTOSAR [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;">]><AUTOSAR>&b;</AUTOSAR>',
    '<!ENTITY x SYSTEM "file:///secret"><AUTOSAR/>',
  ])('rejects external DTDs, internal expansion and bare entities', (xml) => {
    expect(() => importArxml(xml, [])).toThrow('禁止 DTD');
  });
  it('rejects malformed XML, wrong namespaces, multiple modules, unresolved references and excessive nesting', () => {
    const { config, module } = arxmlFixture();
    const xml = exportArxml(config, module);
    expect(() => importArxml('<AUTOSAR><x></AUTOSAR>', [module])).toThrow('XML 格式错误');
    expect(() => importArxml(xml.replace(AUTOSAR_NAMESPACE, 'urn:wrong'), [module])).toThrow(
      '命名空间'
    );
    const moduleXml = xml.match(
      /<ECUC-MODULE-CONFIGURATION-VALUES[\s\S]*?<\/ECUC-MODULE-CONFIGURATION-VALUES>/
    )![0];
    expect(() =>
      importArxml(xml.replace('</ELEMENTS>', moduleXml + '</ELEMENTS>'), [module])
    ).toThrow('仅包含一个');
    expect(() =>
      importArxml(xml.replace(/(<VALUE-REF[^>]*>)[^<]+/, '$1/unknown/path'), [module])
    ).toThrow('引用目标');
    expect(() => importArxml('<x>'.repeat(301) + '</x>'.repeat(301), [module])).toThrow('嵌套过深');
  });
  it('rejects oversized files before reading, and oversized JSON/ARXML strings before parsing', () => {
    expect(() => checkImportSize(MAX_IMPORT_BYTES)).not.toThrow();
    expect(() => checkImportSize(MAX_IMPORT_BYTES + 1)).toThrow('50 MB');
    const text = '中'.repeat(Math.floor(MAX_IMPORT_BYTES / 3) + 1);
    expect(() => importJson(text, [])).toThrow('50 MB');
    expect(() => importArxml(text, [])).toThrow('50 MB');
  });
});

describe('conflict preview and immutable merge', () => {
  it('renames ARXML value conflicts without treating default/configured flags as value differences', () => {
    const { config, module, manager, root } = arxmlFixture();
    manager.setParameterValue(root, module.containers[0].parameters[0].uuid, undefined);
    const incoming = importArxml(exportArxml(config, module), [module]);
    expect(
      incoming.containers[0].parameters.get(module.containers[0].parameters[0].uuid)?.value
    ).toBeUndefined();
    incoming.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')!.value = 42;
    const plan = planImport(config, incoming, module, 'rename');
    expect(plan.conflicts).toHaveLength(1);
    expect(
      plan.result.containers[0].subContainers.find((item) => item.shortName === 'DemDTC_2')
    ).toBeDefined();
  });
  it.each(['overwrite', 'skip', 'rename'] as const)(
    'applies %s with accurate conflicts, preserved originals and remapped references',
    (strategy) => {
      const { config, module, dtc } = fixture();
      const incoming = importJson(exportJson(config), [module]);
      incoming.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')!.value = 42;
      const before = exportJson(config),
        fileBefore = exportJson(incoming);
      const plan = planImport(config, incoming, module, strategy);
      expect(plan.conflicts).toEqual([
        {
          path: 'DemConfigSet/DemDTC',
          parameter: 'DemDtcValue',
          fileValue: '42',
          projectValue: String(0x1a2b3c),
        },
      ]);
      const original = collectContainers(plan.result, module).find(
        (item) => item.container.uuid === dtc.uuid
      )!.container;
      expect(original.parameters.get('fixture-dem-dtc-value')?.value).toBe(
        strategy === 'overwrite' ? 42 : 0x1a2b3c
      );
      const renamed = plan.result.containers[0].subContainers.find(
        (item) => item.shortName === 'DemDTC_2'
      );
      expect(Boolean(renamed)).toBe(strategy === 'rename');
      if (renamed) {
        expect(renamed.uuid).not.toBe(dtc.uuid);
        expect(renamed.parameters.get('fixture-dem-dtc-value')?.value).toBe(42);
        expect(renamed.references.get('fixture-dem-dtc-attributes-ref')?.targetUuid).toBe(
          config.containers[0].subContainers[1].uuid
        );
        expect(
          plan.result.containers[0].subContainers[2].references.get('fixture-dem-event-dtc-ref')
            ?.targetUuid
        ).toBe(renamed.uuid);
      }
      expect(plan.addedContainers).toBe(strategy === 'rename' ? 1 : 0);
      expect(plan.addedParameters).toBe(strategy === 'rename' ? 5 : 0);
      expect(plan.deletedItems).toBe(0);
      expect(exportJson(config)).toBe(before);
      expect(exportJson(incoming)).toBe(fileBefore);
    }
  );
  it('compares reference paths instead of UUIDs and shows both file and project targets', () => {
    const { config, module, manager, root } = fixture();
    manager.addContainerInstance(config, root.uuid, 'fixture-dem-dtc-attributes-def');
    const incoming = cloneConfiguration(config, 'copy');
    expect(planImport(config, incoming, module).conflicts).toHaveLength(0);
    incoming.containers[0].subContainers[0].references.get(
      'fixture-dem-dtc-attributes-ref'
    )!.targetUuid = incoming.containers[0].subContainers[6].uuid;
    expect(planImport(config, incoming, module).conflicts[0]).toMatchObject({
      parameter: 'DemDTCAttributesRef',
      fileValue: 'DemConfigSet/DemDTCAttributes_2',
      projectValue: 'DemConfigSet/DemDTCAttributes',
    });
  });
  it('counts removed parameters/references only on overwritten instances and preserves unrelated children', () => {
    const { config, module } = fixture();
    const incoming = importJson(exportJson(config), [module]);
    incoming.containers[0].subContainers[0].parameters.delete('fixture-dem-dtc-functional-unit');
    incoming.containers[0].subContainers[0].references.delete('fixture-dem-dtc-obd-ref');
    incoming.containers[0].subContainers.pop();
    expect(planImport(config, incoming, module, 'overwrite').deletedItems).toBe(2);
    expect(planImport(config, incoming, module, 'skip').deletedItems).toBe(0);
    expect(planImport(config, incoming, module, 'rename').deletedItems).toBe(0);
    expect(planImport(config, incoming, module).result.containers[0].subContainers).toHaveLength(6);
  });
  it('regenerates colliding UUIDs on new paths and prevents rename from exceeding multiplicity', () => {
    const { config, module } = fixture();
    const incoming = importJson(exportJson(config), [module]);
    incoming.containers[0].subContainers[0].shortName = 'AnotherDtc';
    const result = planImport(config, incoming, module).result;
    const entries = collectContainers(result, module);
    expect(new Set(entries.map((item) => item.container.uuid)).size).toBe(entries.length);
    incoming.containers[0].parameters.values().next().value!.value = true;
    const before = exportJson(config);
    expect(() => planImport(config, incoming, module, 'rename')).toThrow('实例上限');
    expect(exportJson(config)).toBe(before);
  });
});

describe('definition-driven DTC CSV', () => {
  it('exports BOM, one row per DTC, six-digit uppercase hex and referenced attributes / EventIds', () => {
    const { config, module, manager, root, dtc } = fixture();
    const second = manager.addContainerInstance(config, root.uuid, 'fixture-dem-dtc-def');
    manager.setParameterValue(second, 'fixture-dem-dtc-value', 1);
    const event = manager.addContainerInstance(config, root.uuid, 'fixture-dem-event-param-def');
    manager.setParameterValue(event, 'fixture-dem-event-id', 2);
    manager.setReferenceTarget(event, 'fixture-dem-event-dtc-ref', dtc.uuid);
    completeDemArxml(config, module);
    const csv = exportCsv(config, module);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Attributes 名');
    expect(rows[1]).toContain('"0x1A2B3C"');
    expect(rows[1]).toContain('"DemDTCAttributes","1;2"');
    expect(rows[2]).toContain('"0x000001"');
  });
  it('keeps extracting values after definitions and instances are renamed, escaping spreadsheet text', () => {
    const { config, module, dtc } = fixture();
    completeDemArxml(config, module);
    module.shortName = config.moduleRef = 'GenericModule';
    module.containers[0].subContainers[0].shortName = 'DiagnosticItem';
    for (const p of module.containers[0].subContainers[0].parameters)
      p.shortName = 'Field' + p.exportRole;
    for (const definition of module.containers[0].subContainers)
      for (const reference of definition.references)
        if (reference.destinationContainerType === 'DemDTC')
          reference.destinationContainerType = 'DiagnosticItem';
    // Formula escaping is a free-text projection test, not an invalid ENUM bypass.
    const severity = module.containers[0].subContainers[0].parameters.find(
      (p) => p.exportRole === 'severity'
    )!;
    severity.type = 'STRING';
    severity.enumValues = undefined;
    dtc.shortName = 'Renamed';
    dtc.parameters.get('fixture-dem-dtc-severity')!.value = '=HYPERLINK("bad")';
    const csv = exportCsv(config, module);
    expect(csv).toContain('0x1A2B3C');
    expect(csv).toContain('\'=HYPERLINK(""bad"")');
  });
});
