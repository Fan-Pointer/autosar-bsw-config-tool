import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { BswmdLoader } from '../src/core/bswmd/BswmdLoader';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { indexDefinitions } from '../src/core/config/ConfigTraversal';
import { createParameterValue } from '../src/core/config/ConfigValues';
import {
  referenceDefinitionDest,
  resolveReferenceCandidates,
} from '../src/core/config/ReferenceCandidates';
import { exportJson, importJson } from '../src/core/io/ConfigJson';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';
import { CGenerator } from '../src/core/generator/CGenerator';
import { builtinCatalog, readBuiltinModules } from '../src/modules/builtinCatalog';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const fields = (module: BswmdModule) =>
  [...indexDefinitions(module).values()].flatMap((c) => c.parameters);

describe('TASK-021 real catalog and source semantics', () => {
  it('exports the explicitly configured official Dem 4.2.2 acceptance sample without losing values', async () => {
    const [module] = await readBuiltinModules(['Dem'], '4.2.2');
    const source = read('../.codex/reports/evidence/task021/dem422-smoke.json');
    const config = importJson(source, [module]);
    expect(evaluateOutputReadiness(config, module).ready).toBe(true);
    const xml = exportArxml(config, module);
    expect(xml).toContain('http://autosar.org/schema/r4.0');
    expect(exportJson(importArxml(xml, [module]))).toBe(exportJson(config));
    const generator = new CGenerator();
    expect((await generator.generateHeader(config, module)).content).toContain('#define');
    expect((await generator.generateSource(config, module)).content).toContain('Dem_Cfg.h');
  });

  it.each([
    ['4.4.0', 98, 94, 94],
    ['4.2.2', 84, 78, 23],
  ] as const)(
    'covers every source module in %s, hashes every parsed asset and checks every selectable output boundary',
    async (release, count, parsed, selectable) => {
      const entries = builtinCatalog.filter((e) => e.release === release);
      expect(entries).toHaveLength(count);
      expect(new Set(entries.map((e) => e.shortName)).size).toBe(count);
      expect(entries.filter((e) => e.parsed)).toHaveLength(parsed);
      expect(entries.filter((e) => e.status !== 'unsupported')).toHaveLength(selectable);
      for (const entry of entries) {
        if (entry.status === 'unsupported') {
          expect(entry.reason.length).toBeGreaterThan(5);
          expect(entry.batch).toMatch(/^B2-/);
        }
        if (entry.asset) {
          const { $source, ...body } = JSON.parse(
            read(`../bswmd/builtin/${release}/${entry.asset}`)
          );
          expect(
            createHash('sha256')
              .update(JSON.stringify(body, null, 2) + '\n')
              .digest('hex')
          ).toBe(entry.contentSha256);
          expect($source.contentSha256).toBe(entry.contentSha256);
          expect(body.version).toBe(release);
        }
        if (entry.status === 'unsupported') continue;
        const [module] = await readBuiltinModules([entry.shortName], release);
        const config = new ConfigInstanceManager([module]).createFromBswmd(module);
        config.name = module.shortName;
        expect(importJson(exportJson(config), [module])).toEqual(config);
        const check = evaluateOutputReadiness(config, module),
          generator = new CGenerator();
        if (check.ready) {
          expect(importArxml(exportArxml(config, module), [module])).toEqual(config);
          expect(await generator.generateHeader(config, module)).toBeTruthy();
          expect(await generator.generateSource(config, module)).toBeTruthy();
        } else {
          expect(check.issues.some((issue) => issue.severity === 'ERROR')).toBe(true);
          expect(() => exportArxml(config, module)).toThrow();
          await expect(generator.generateHeader(config, module)).rejects.toThrow();
          await expect(generator.generateSource(config, module)).rejects.toThrow();
        }
      }
    },
    30000
  );

  it('retains all three invalid official defaults without inventing an editor suggestion', () => {
    const source = read('./fixtures/ecuc-enum-symbolic-4.2.2.arxml');
    const modules = ['Dem', 'FrTrcv'].map((name) => importEcucModuleArxml(source, name));
    const invalid = modules.flatMap(fields).filter((p) => p.sourceDefaultValue !== undefined);
    expect(invalid.map((p) => p.shortName).sort()).toEqual([
      'DemDTCSeverity',
      'DemEventMemoryEntryStorageTrigger',
      'FrTrcvInitState',
    ]);
    for (const field of invalid) {
      expect(field.defaultValue).toBeUndefined();
      expect(field.enumValues).not.toContain(field.sourceDefaultValue);
      expect(field.enumValues!.length).toBeGreaterThan(1);
      expect(createParameterValue(field)).toMatchObject({ value: '', isConfigured: false });
      expect(field.definitionIssue).toContain(field.sourceDefaultValue);
    }
    for (const module of modules) {
      const copy = new BswmdParser().parseFromJson(JSON.stringify(module));
      fields(copy).forEach((field, index) => expect(field).toMatchObject(fields(module)[index]));
      expect(copy.importWarnings).toEqual(module.importWarnings);
    }
  });

  it.each(['4.4.0', '4.2.2'])(
    'keeps all six official hardware enums empty and readonly in %s',
    (release) => {
      const source = read(`./fixtures/ecuc-enum-symbolic-${release}.arxml`);
      const modules = ['Adc', 'Ocu'].map((name) => importEcucModuleArxml(source, name));
      const enums = modules.flatMap(fields).filter((p) => p.vendorSpecific);
      expect(enums).toHaveLength(6);
      for (const field of enums) {
        expect(field.enumValues).toEqual([]);
        expect(field.readOnly).toBe(true);
        expect(field.defaultValue).toBeUndefined();
      }
      for (const module of modules) {
        expect(fields(new BswmdParser().parseFromJson(JSON.stringify(module)))).toEqual(
          fields(module)
        );
      }
    }
  );

  it('retains all four official Dem symbolic destinations and never offers local substitutes', async () => {
    const source = read('./fixtures/ecuc-enum-symbolic-4.2.2.arxml');
    const fragment = importEcucModuleArxml(source, 'Dem');
    const [module] = await readBuiltinModules(['Dem'], '4.2.2');
    const refs = [...indexDefinitions(fragment).values()].flatMap((c) => c.references);
    expect(refs).toHaveLength(4);
    const realRefs = [...indexDefinitions(module).values()]
      .flatMap((c) => c.references)
      .filter((r) => r.kind === 'symbolic');
    expect(realRefs.map((r) => [r.uuid, r.destinationRef, r.multiplicity])).toEqual(
      refs.map((r) => [r.uuid, r.destinationRef, r.multiplicity])
    );
    const config = new ConfigInstanceManager([module]).createFromBswmd(module);
    config.name = module.shortName;
    for (const ref of refs) {
      expect(ref.kind).toBe('symbolic');
      expect(ref.isExternal).toBe(true);
      expect(referenceDefinitionDest(ref)).toBe('ECUC-SYMBOLIC-NAME-REFERENCE-DEF');
      expect(resolveReferenceCandidates(ref, config, module)).toEqual([]);
    }
  });

  it('preserves an invalid synthetic enum default and a deliberately open hardware enum', () => {
    const module = importEcucModuleArxml(
      `<AUTOSAR xmlns="http://autosar.org/schema/r4.0"><ECUC-MODULE-DEF><SHORT-NAME>Example</SHORT-NAME><CONTAINERS><ECUC-PARAM-CONF-CONTAINER-DEF><SHORT-NAME>Root</SHORT-NAME><PARAMETERS><ECUC-ENUMERATION-PARAM-DEF><SHORT-NAME>Mode</SHORT-NAME><DEFAULT-VALUE>OBSOLETE</DEFAULT-VALUE><LITERALS><ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>VALID</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF></LITERALS></ECUC-ENUMERATION-PARAM-DEF><ECUC-ENUMERATION-PARAM-DEF><SHORT-NAME>Hardware</SHORT-NAME></ECUC-ENUMERATION-PARAM-DEF></PARAMETERS></ECUC-PARAM-CONF-CONTAINER-DEF></CONTAINERS></ECUC-MODULE-DEF></AUTOSAR>`,
      'Example'
    );
    const [mode, hardware] = fields(module);
    expect(mode).toMatchObject({ sourceDefaultValue: 'OBSOLETE', enumValues: ['VALID'] });
    expect(createParameterValue(mode)).toMatchObject({ value: '', isConfigured: false });
    expect(hardware).toMatchObject({ enumValues: [], vendorSpecific: true, readOnly: true });
    expect(
      new BswmdParser().parseFromJson(JSON.stringify(module)).containers[0].parameters[1].readOnly
    ).toBe(true);
  });

  it('round-trips a configured local symbolic reference and rejects a wrong target', () => {
    const module = importEcucModuleArxml(
      `<AUTOSAR xmlns="http://autosar.org/schema/r4.0"><ECUC-MODULE-DEF><SHORT-NAME>Example</SHORT-NAME><ADMIN-DATA><DOC-REVISIONS><DOC-REVISION><REVISION-LABEL>4.2.2</REVISION-LABEL></DOC-REVISION></DOC-REVISIONS></ADMIN-DATA><CONTAINERS><ECUC-PARAM-CONF-CONTAINER-DEF UUID="root"><SHORT-NAME>Root</SHORT-NAME><REFERENCES><ECUC-SYMBOLIC-NAME-REFERENCE-DEF UUID="ref"><SHORT-NAME>Target</SHORT-NAME><DESTINATION-REF>/AUTOSAR/EcucDefs/Example/Root</DESTINATION-REF></ECUC-SYMBOLIC-NAME-REFERENCE-DEF></REFERENCES></ECUC-PARAM-CONF-CONTAINER-DEF></CONTAINERS></ECUC-MODULE-DEF></AUTOSAR>`,
      'Example'
    );
    const manager = new ConfigInstanceManager([module]),
      config = manager.createFromBswmd(module);
    config.name = module.shortName;
    const root = config.containers[0];
    manager.setReferenceTarget(root, 'ref', 'missing');
    expect(evaluateOutputReadiness(config, module).ready).toBe(false);
    manager.setReferenceTarget(root, 'ref', root.uuid);
    const xml = exportArxml(config, module);
    expect(xml).toContain('DEST="ECUC-SYMBOLIC-NAME-REFERENCE-DEF"');
    expect(importArxml(xml, [module])).toEqual(config);
    expect(
      resolveReferenceCandidates(module.containers[0].references[0], config, module)
    ).toHaveLength(1);
    expect(() =>
      resolveReferenceCandidates(module.containers[0].references[0], config, {
        ...module,
        version: '4.4.0',
      })
    ).toThrow('exact module version');
  });

  it('caches same-name releases independently and never imports value files against the wrong release', async () => {
    const [old] = await readBuiltinModules(['Dem'], '4.2.2'),
      [modern] = await readBuiltinModules(['Dem'], '4.4.0');
    const loader = new BswmdLoader();
    for (const module of [old, modern]) loader.loadFromString(JSON.stringify(module));
    expect(loader.getAllModules()).toHaveLength(2);
    expect(loader.getModule('Dem')).toMatchObject({ version: '4.4.0' });
    expect(loader.getModule('Dem', '4.2.2')?.containers[0].uuid).toBe(old.containers[0].uuid);
    const config = new ConfigInstanceManager([old, modern]).createFromBswmd(old);
    expect(importJson(exportJson(config), [modern, old]).version).toBe('4.2.2');
    expect(() => importJson(exportJson(config), [modern])).toThrow();
    // Minimal generic definitions isolate release metadata from official required-value output guards.
    const definitions = [old, modern].map((m) => ({ ...m, containers: [], importWarnings: [] }));
    const values = definitions.map((m) => new ConfigInstanceManager([m]).createFromBswmd(m));
    const oldXml = exportArxml(values[0], definitions[0]);
    expect(importArxml(oldXml, [...definitions].reverse()).version).toBe('4.2.2');
    expect(() => importArxml(oldXml, [definitions[1]])).toThrow('不能跨版本');
    expect(
      importArxml(
        exportArxml(values[1], definitions[1]).replace(/<ADMIN-DATA>[\s\S]*?<\/ADMIN-DATA>/g, ''),
        definitions
      ).version
    ).toBe('4.4.0');
  });
});
