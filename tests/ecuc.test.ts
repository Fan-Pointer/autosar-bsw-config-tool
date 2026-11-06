import { describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { importEcucModuleArxml, listEcucModuleNames } from '../src/core/bswmd/EcucArxmlImporter';
import { extractEcucModule, locateEcucModules } from '../src/core/bswmd/EcucModuleSource';
import { indexDefinitions, collectContainers } from '../src/core/config/ConfigTraversal';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { ConstraintEngine } from '../src/core/constraint/ConstraintEngine';
import { DefinitionConstraints } from '../src/core/constraint/DefinitionConstraints';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { serializeConfig } from '../src/core/io/ConfigJson';
import { withoutXmlComments } from '../src/core/io/XmlSafety';

const nvm = readFileSync('tests/fixtures/ecuc-nvm.arxml', 'utf8');
const canif = readFileSync('tests/fixtures/ecuc-canif.arxml', 'utf8');
function wrap(body: string, name = 'Sample'): string {
  return `<AUTOSAR xmlns="http://autosar.org/schema/r4.0"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>${name}</SHORT-NAME><CONTAINERS>${body}</CONTAINERS></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
}
function container(parameters: string, references = ''): string {
  return `<ECUC-PARAM-CONF-CONTAINER-DEF><SHORT-NAME>Root</SHORT-NAME><PARAMETER-DEFS>${parameters}</PARAMETER-DEFS><REFERENCE-DEFS>${references}</REFERENCE-DEFS></ECUC-PARAM-CONF-CONTAINER-DEF>`;
}
function param(tag: string, body = ''): string {
  return `<${tag}><SHORT-NAME>Value</SHORT-NAME>${body}</${tag}>`;
}
function importedParameter(tag: string, body = '') {
  return importEcucModuleArxml(wrap(container(param(tag, body))), 'Sample').containers[0]
    .parameters[0];
}

describe('official ECUC selected-module importer', () => {
  it('D2: preserves comment-shaped literal CDATA while removing actual comments', () => {
    expect(withoutXmlComments('<a><!-- discard --><![CDATA[<!--keep-->]]></a>')).toBe(
      '<a><![CDATA[<!--keep-->]]></a>'
    );
  });
  it.each([
    ['NvM', nvm],
    ['CanIf', canif],
  ])('preserves all containers, fields and source UUIDs for %s', (name, source) => {
    const module = new BswmdParser().parseFromArxml(source, name);
    const definitions = [...indexDefinitions(module).values()];
    const parameters = definitions.flatMap((item) => item.parameters),
      references = definitions.flatMap((item) => item.references);
    expect(module.shortName).toBe(name);
    expect(module.version).toBe('4.4.0');
    expect(module.multiplicity).toEqual({ lower: 0, upper: 1 });
    expect(definitions.length).toBeGreaterThanOrEqual(5);
    expect(parameters.length).toBeGreaterThanOrEqual(20);
    expect(references.length).toBeGreaterThanOrEqual(3);
    expect(definitions.length).toBe(
      (source.match(/<ECUC-(?:PARAM-CONF|CHOICE)-CONTAINER-DEF\b/g) ?? []).length
    );
    expect(parameters.length).toBe(
      (
        source.match(
          /<ECUC-(?:BOOLEAN-PARAM|INTEGER-PARAM|FLOAT-PARAM|ENUMERATION-PARAM|STRING-PARAM|FUNCTION-NAME)-DEF[\s>]/g
        ) ?? []
      ).length
    );
    expect(references.length).toBe((source.match(/<ECUC-REFERENCE-DEF\b/g) ?? []).length);
    expect(parameters.every((item) => item.type && item.uuid.startsWith('ECUC:'))).toBe(true);
    expect(
      parameters.filter((item) => item.type === 'ENUM').every((item) => item.enumValues?.length)
    ).toBe(true);
    const integer = parameters.find(
      (item) => item.type === 'INTEGER' && item.min !== undefined && item.max !== undefined
    )!;
    expect(integer.min).toBeLessThanOrEqual(integer.max!);
    console.info(
      `${name}: ${definitions.length} containers, ${parameters.length} parameters, ${references.length} references`
    );
  });
  it('retains choice alternatives and cross-module destinations with visible export limitations', () => {
    const module = importEcucModuleArxml(nvm, 'NvM');
    const defs = [...indexDefinitions(module).values()];
    expect(
      defs.find((item) => item.shortName === 'NvMTargetBlockReference')?.subContainers
    ).toHaveLength(2);
    expect(
      defs
        .flatMap((item) => item.references)
        .every((item) => item.destinationRef?.startsWith('/AUTOSAR/EcucDefs/'))
    ).toBe(true);
    // TASK-009 implemented inline CHOICE support; an empty mandatory choice still blocks output.
    const choice = defs.find((item) => item.shortName === 'NvMTargetBlockReference')!;
    expect(choice.choice?.candidateRefs).toEqual(choice.subContainers.map((item) => item.uuid));
    expect(module.arxmlExportBlockers).toEqual([]);
    expect(
      module.importWarnings?.some((item) => item.includes('CHOICE 分组需选择一个候选后导出'))
    ).toBe(true);
    expect(module.importWarnings?.some((item) => /位于本模块之外|跨模块/.test(item))).toBe(true);
    expect(() => exportArxml(new ConfigInstanceManager().createFromBswmd(module), module)).toThrow(
      'CHOICE'
    );
  });
  it('lists all modules without parsing trees and only passes the selected segment to the parser', () => {
    const a = nvm.slice(
      nvm.indexOf('<ECUC-MODULE-DEF '),
      nvm.lastIndexOf('</ECUC-MODULE-DEF>') + 18
    );
    const b = canif.slice(
      canif.indexOf('<ECUC-MODULE-DEF '),
      canif.lastIndexOf('</ECUC-MODULE-DEF>') + 18
    );
    const combined = `<AUTOSAR xmlns="http://autosar.org/schema/r4.0">${a}${b}</AUTOSAR>`;
    const parse = vi.spyOn(XMLParser.prototype, 'parse');
    try {
      expect(listEcucModuleNames(combined)).toEqual(['NvM', 'CanIf']);
      expect(parse).not.toHaveBeenCalled();
      importEcucModuleArxml(combined, 'NvM');
      expect(parse).toHaveBeenCalledTimes(1);
      expect(String(parse.mock.calls[0][0])).not.toContain('<SHORT-NAME>CanIf</SHORT-NAME>');
      expect(String(parse.mock.calls[0][0]).length).toBeLessThan(combined.length / 2);
    } finally {
      parse.mockRestore();
    }
  });
  it('uses stable generated definition UUIDs for sources without UUID attributes', () => {
    const source = wrap(container(param('ECUC-BOOLEAN-PARAM-DEF')));
    expect(importEcucModuleArxml(source, 'Sample')).toEqual(
      importEcucModuleArxml(source, 'Sample')
    );
  });
  it('supports prefixes, skips fake comment modules, and preserves package ancestry on extraction', () => {
    const source = wrap(container(''))
      .replace(/<(\/?)([A-Z][A-Z-]*)/g, '<$1ar:$2')
      .replace('xmlns=', 'xmlns:ar=');
    const commented = source.replace(
      '<ar:AR-PACKAGES>',
      '<!-- <ECUC-MODULE-DEF><SHORT-NAME>Fake</SHORT-NAME></ECUC-MODULE-DEF> --><ar:AR-PACKAGES>'
    );
    expect(listEcucModuleNames(commented)).toEqual(['Sample']);
    const [slice] = locateEcucModules(commented);
    const extracted = extractEcucModule(commented, slice);
    const xml = new DOMParser().parseFromString(extracted, 'application/xml');
    expect(xml.querySelector('parsererror')).toBeNull();
    expect(
      Array.from(xml.getElementsByTagNameNS('*', 'AR-PACKAGE')).map(
        (pkg) => pkg.firstElementChild?.textContent
      )
    ).toEqual(['AUTOSAR', 'EcucDefs']);
    expect(importEcucModuleArxml(extracted, 'Sample').containers).toHaveLength(1);
  });
  it('rejects absent and duplicate module names and malformed nesting', () => {
    expect(() => importEcucModuleArxml(nvm, 'Missing')).toThrow('未找到');
    const source = wrap(container(''));
    expect(() =>
      listEcucModuleNames(
        source.replace(
          '</ELEMENTS>',
          '<ECUC-MODULE-DEF><SHORT-NAME>Sample</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS>'
        )
      )
    ).toThrow('重复');
    expect(() => listEcucModuleNames(source.replace('</CONTAINERS>', '</WRONG>'))).toThrow(
      '不匹配'
    );
  });
  it.each([
    '<!DOCTYPE AUTOSAR SYSTEM "file:///secrets">',
    '<!ENTITY ext SYSTEM "https://example.invalid">',
    '<xi:include href="file:///secrets"/>',
  ])('rejects unsafe declarations before selected parsing: %s', (declaration) => {
    expect(() =>
      importEcucModuleArxml(nvm.replace('<AUTOSAR ', `${declaration}<AUTOSAR `), 'NvM')
    ).toThrow(/禁止/);
  });
  it('D2: accepts a legal comment mentioning DOCTYPE in both definitions and configuration imports', () => {
    const module = importEcucModuleArxml(
      wrap(container('')).replace(
        '<CONTAINERS>',
        '<!-- <!DOCTYPE example [ > unclosed demonstration --> <CONTAINERS>'
      ),
      'Sample'
    );
    const instance = new ConfigInstanceManager().createFromBswmd(module);
    const xml = exportArxml(instance, module).replace(
      '<AR-PACKAGES>',
      '<!-- <!DOCTYPE example --> <AR-PACKAGES>'
    );
    expect(importArxml(xml, [module]).containers[0].uuid).toBe(instance.containers[0].uuid);
    expect(() =>
      importArxml(xml.replace('<AR-PACKAGES>', '<!DOCTYPE AUTOSAR><AR-PACKAGES>'), [module])
    ).toThrow('DOCTYPE');
  });
  it('maps integer, hexadecimal bounds and numeric defaults', () => {
    expect(
      importedParameter(
        'ECUC-INTEGER-PARAM-DEF',
        '<MIN>0x10</MIN><MAX>255</MAX><DEFAULT-VALUE>32</DEFAULT-VALUE>'
      )
    ).toMatchObject({ type: 'INTEGER', min: 16, max: 255, defaultValue: 32, isOptional: false });
  });
  it('maps float defaults and unbounded multiplicity', () => {
    expect(
      importedParameter(
        'ECUC-FLOAT-PARAM-DEF',
        '<MIN>-1.5</MIN><MAX>1e3</MAX><DEFAULT-VALUE>0.5</DEFAULT-VALUE><LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY><UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>'
      )
    ).toMatchObject({
      type: 'FLOAT',
      min: -1.5,
      max: 1000,
      defaultValue: 0.5,
      isOptional: true,
      multiplicity: { lower: 0, upper: 'unbounded' },
    });
  });
  it('maps official floating Inf/-Inf bounds to absent finite limits without losing them to JSON null', () => {
    const value = importedParameter(
      'ECUC-FLOAT-PARAM-DEF',
      '<MIN>-Inf</MIN><MAX>Inf</MAX><DEFAULT-VALUE>1</DEFAULT-VALUE>'
    );
    expect(value.min).toBeUndefined();
    expect(value.max).toBeUndefined();
    expect(JSON.parse(JSON.stringify(value))).not.toHaveProperty('max');
  });
  it.each([
    ['true', true],
    ['false', false],
    ['1', true],
    ['0', false],
  ])('maps boolean literal %s', (value, expected) => {
    expect(
      importedParameter('ECUC-BOOLEAN-PARAM-DEF', `<DEFAULT-VALUE>${value}</DEFAULT-VALUE>`)
        .defaultValue
    ).toBe(expected);
  });
  it('maps enumeration literal names and default', () => {
    expect(
      importedParameter(
        'ECUC-ENUMERATION-PARAM-DEF',
        '<DEFAULT-VALUE>A</DEFAULT-VALUE><LITERALS><ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>A</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF><ECUC-ENUMERATION-LITERAL-DEF><SHORT-NAME>B</SHORT-NAME></ECUC-ENUMERATION-LITERAL-DEF></LITERALS>'
      )
    ).toMatchObject({ type: 'ENUM', enumValues: ['A', 'B'], defaultValue: 'A' });
  });
  it.each(['ECUC-STRING-PARAM-DEF', 'ECUC-FUNCTION-NAME-DEF'])(
    'maps conditional string metadata for %s',
    (tag) => {
      const field = importedParameter(
        tag,
        `<${tag}-VARIANTS><${tag}-CONDITIONAL><MIN-LENGTH>2</MIN-LENGTH><MAX-LENGTH>12</MAX-LENGTH><REGULAR-EXPRESSION>[A-Z]+</REGULAR-EXPRESSION><DEFAULT-VALUE>OK</DEFAULT-VALUE></${tag}-CONDITIONAL></${tag}-VARIANTS>`
      );
      expect(field).toMatchObject({
        minLength: 2,
        maxLength: 12,
        regularExpression: '[A-Z]+',
        defaultValue: 'OK',
        type: tag.includes('FUNCTION') ? 'FUNCTION' : 'STRING',
      });
    }
  );
  it('preserves reference requiredness, full target path and upper multiplicity', () => {
    const module = importEcucModuleArxml(
      wrap(
        container(
          '',
          param(
            'ECUC-REFERENCE-DEF',
            '<LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY><UPPER-MULTIPLICITY>2</UPPER-MULTIPLICITY><DESTINATION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR/EcucDefs/Sample/Root</DESTINATION-REF>'
          )
        )
      ),
      'Sample'
    );
    expect(module.containers[0].references[0]).toMatchObject({
      isOptional: true,
      destinationContainerType: 'Root',
      multiplicity: { lower: 0, upper: 2 },
    });
  });
  it.each([
    ['ECUC-BOOLEAN-PARAM-DEF', '<DEFAULT-VALUE>yes</DEFAULT-VALUE>'],
    ['ECUC-INTEGER-PARAM-DEF', '<MIN>9</MIN><MAX>1</MAX>'],
    ['ECUC-INTEGER-PARAM-DEF', '<DEFAULT-VALUE>1.5</DEFAULT-VALUE>'],
    ['ECUC-ENUMERATION-PARAM-DEF', ''],
    ['ECUC-UNSUPPORTED-PARAM-DEF', ''],
  ])('rejects invalid definitions without silently dropping %s', (tag, body) => {
    expect(() => importedParameter(tag, body)).toThrow();
  });
  it('derives required and range violations for official metadata without module-specific rules', () => {
    const module = importEcucModuleArxml(nvm, 'NvM'),
      manager = new ConfigInstanceManager(),
      config = manager.createFromBswmd(module);
    const entry = collectContainers(config, module).find((item) =>
      item.definition.parameters.some(
        (p) => p.type === 'INTEGER' && !p.isOptional && p.max !== undefined
      )
    )!;
    const field = entry.definition.parameters.find(
      (p) => p.type === 'INTEGER' && !p.isOptional && p.max !== undefined
    )!;
    const engine = new ConstraintEngine();
    engine.registerRules(DefinitionConstraints);
    manager.setParameterValue(entry.container, field.uuid, undefined);
    expect(
      engine
        .validate(config, module)
        .some((item) => item.definitionRef === field.uuid && item.message.includes('required'))
    ).toBe(true);
    manager.setParameterValue(entry.container, field.uuid, field.max! + 1);
    expect(
      engine
        .validate(config, module)
        .some((item) => item.definitionRef === field.uuid && item.message.includes('out of range'))
    ).toBe(true);
  });
  it('instantiates mandatory roots only and preserves UUID definition links', () => {
    const module = importEcucModuleArxml(canif, 'CanIf'),
      config = new ConfigInstanceManager().createFromBswmd(module);
    expect(config.containers.length).toBe(
      module.containers.reduce((sum, item) => sum + item.multiplicity.lower, 0)
    );
    for (const entry of collectContainers(config, module))
      expect(entry.container.definitionRef).toBe(entry.definition.uuid);
    for (const definition of module.containers.filter((item) => item.multiplicity.lower === 0))
      expect(config.containers.some((item) => item.definitionRef === definition.uuid)).toBe(false);
  });
  it('keeps fixtures compact and structurally complete', () => {
    expect(
      statSync('tests/fixtures/ecuc-nvm.arxml').size +
        statSync('tests/fixtures/ecuc-canif.arxml').size
    ).toBeLessThan(1_200_000);
    for (const source of [nvm, canif])
      expect(
        new DOMParser().parseFromString(source, 'application/xml').querySelector('parsererror')
      ).toBeNull();
  });
  it('preserves ordinary function parameters through generic ARXML export/import', () => {
    const module = importEcucModuleArxml(
      wrap(container(param('ECUC-FUNCTION-NAME-DEF', '<DEFAULT-VALUE>Callback</DEFAULT-VALUE>'))),
      'Sample'
    );
    const manager = new ConfigInstanceManager(),
      config = manager.createFromBswmd(module);
    manager.setParameterValue(
      config.containers[0],
      module.containers[0].parameters[0].uuid,
      'Callback'
    );
    const xml = exportArxml(config, module);
    expect(xml).toContain('DEST="ECUC-FUNCTION-NAME-DEF"');
    expect(JSON.stringify(serializeConfig(importArxml(xml, [module])).containers)).toBe(
      JSON.stringify(serializeConfig(config).containers)
    );
  });
});
