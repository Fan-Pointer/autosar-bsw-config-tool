import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { exportCsv } from '../src/core/io/Csv';
import { exportJson } from '../src/core/io/ConfigJson';
import { CGenerator } from '../src/core/generator/CGenerator';
import {
  evaluateOutputReadiness,
  OutputValidationError,
  type OutputCheckResult,
} from '../src/core/output/OutputGate';
import { useConfigStore } from '../src/stores/configStore';
import { confirmOfficialRequiredReferences } from './helpers/officialDemOutput';
import { DemConstraints } from '../src/modules/dem/DemConstraints';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import synthetic from './fixtures/synthetic-dem.json';
import { completeDemArxml } from './helpers/completeDemArxml';

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined),
    }),
  },
}));
beforeEach(() => setActivePinia(createPinia()));

function sample() {
  const module: BswmdModule = {
    shortName: 'Sample',
    version: 'TEST-1',
    definitionPath: '/Supplier/Ecu/Definitions/Sample',
    containers: [
      {
        uuid: 'root',
        shortName: 'Root',
        definitionPath: '/Supplier/Ecu/Definitions/Sample/Settings',
        multiplicity: { lower: 1, upper: 1 },
        parameters: [
          {
            uuid: 'n',
            shortName: 'Number',
            definitionPath: '/Supplier/Fields/Count',
            type: 'INTEGER',
            configClass: 'PRE_COMPILE',
            isOptional: false,
            defaultValue: 0,
            min: 0,
            max: 100,
            exportRole: 'dtcValue',
          },
          {
            uuid: 'b',
            shortName: 'Boolean',
            definitionPath: '/Supplier/Fields/Enabled',
            type: 'BOOLEAN',
            configClass: 'PRE_COMPILE',
            isOptional: false,
            defaultValue: false,
          },
          {
            uuid: 'o',
            shortName: 'Optional',
            type: 'STRING',
            configClass: 'PRE_COMPILE',
            isOptional: true,
            defaultValue: 'SUGGESTION_ONLY',
          },
        ],
        references: [
          {
            uuid: 'ref',
            shortName: 'Ref',
            definitionPath: '/Supplier/Relations/Self',
            isOptional: true,
            destinationContainerType: 'Root',
          },
        ],
        subContainers: [],
      },
    ],
  };
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  config.name = 'Sample';
  const root = config.containers[0];
  const complete = () => {
    manager.setParameterValue(root, 'n', 0);
    manager.setParameterValue(root, 'b', false);
  };
  return { module, manager, config, root, complete };
}

async function rejections(
  config: ReturnType<typeof sample>['config'],
  module: BswmdModule,
  check?: OutputCheckResult
) {
  const generator = new CGenerator();
  const actions = [
    () => exportArxml(config, module, check),
    () => exportCsv(config, module, check),
    () => generator.generateHeader(config, module, check),
    () => generator.generateSource(config, module, check),
  ];
  const results = [];
  for (const action of actions) {
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OutputValidationError);
    results.push((caught as OutputValidationError).result.issues);
  }
  return results;
}

describe('one output gate across actions', () => {
  it('the fixed synthetic definition emits exactly its 15 confirmed parameters in ARXML and C', async () => {
    const module = new BswmdParser().parseFromJson(JSON.stringify(synthetic));
    const manager = new ConfigInstanceManager([module]),
      config = manager.createFromBswmd(module);
    for (const definition of module.containers[0].subContainers)
      manager.addContainerInstance(config, config.containers[0].uuid, definition.uuid);
    completeDemArxml(config, module);
    const expected = collectContainers(config, module).flatMap((entry) =>
      [...entry.container.parameters.values()].filter(
        (field) => field.isConfigured && field.value !== undefined
      )
    );
    expect(expected).toHaveLength(15);
    const xml = exportArxml(config, module),
      source = await new CGenerator().generateSource(config, module);
    expect(
      new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('VALUE')
    ).toHaveLength(expected.length);
    expect(source.content.match(/^\s+\.P/gm)).toHaveLength(expected.length);
  });
  it('does not let a module rule turn an optional untouched DTC value into a required field', async () => {
    const { config, module, root, manager } = sample();
    module.shortName = config.moduleRef = 'Dem';
    module.containers[0].shortName = 'DemDTC';
    module.containers[0].parameters[0].shortName = 'DemDtcValue';
    module.containers[0].parameters[0].isOptional = true;
    manager.setParameterValue(root, 'b', false);
    const check = evaluateOutputReadiness(config, module, DemConstraints);
    expect(check).toEqual({ ready: true, issues: [] });
    expect(exportCsv(config, module, check).split('\r\n')).toHaveLength(1);
    expect(exportArxml(config, module, check)).not.toContain('<VALUE>0</VALUE>');
    expect((await new CGenerator().generateHeader(config, module, check)).content).not.toContain(
      'DEMDTCVALUE'
    );
  });
  it('permits untouched mandatory defaults, keeps the four-output agreement and preserves JSON retrieval', async () => {
    // 用户裁定（2026-11-09）默认值即配置：n/b 必填的默认值（0/false）放行导出。
    const { config, module } = sample();
    const before = exportJson(config);
    const check = evaluateOutputReadiness(config, module);
    expect(check.ready).toBe(true);
    expect(check.issues).toEqual([]);
    // 四出口在放行状态下应全部成功（无 OutputValidationError）。
    const generator = new CGenerator();
    expect(() => exportArxml(config, module, check)).not.toThrow();
    expect((await generator.generateHeader(config, module, check)).content).toContain('P0_NUMBER 0');
    expect(exportJson(config)).toBe(before);
  });

  it('keeps confirmed zero and false, and omits optional suggestions and cached unconfigured references from every output', async () => {
    const { config, module, root, complete } = sample();
    complete();
    root.references.get('ref')!.targetUuid = 'cached-missing-target';
    expect(evaluateOutputReadiness(config, module)).toEqual({ ready: true, issues: [] });
    const xml = exportArxml(config, module),
      generator = new CGenerator();
    const header = await generator.generateHeader(config, module),
      source = await generator.generateSource(config, module);
    expect(
      new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('VALUE')
    ).toHaveLength(2);
    expect(xml).toContain('<VALUE>0</VALUE>');
    expect(xml).toContain('<VALUE>false</VALUE>');
    expect(header.content).toContain('P0_NUMBER 0');
    expect(header.content).toContain('P1_BOOLEAN FALSE');
    expect(source.content.match(/^\s+\.P/gm)).toHaveLength(2);
    for (const output of [xml, header.content, source.content, exportCsv(config, module)]) {
      expect(output).not.toContain('SUGGESTION_ONLY');
      expect(output).not.toContain('cached-missing-target');
    }
    expect(header.content).not.toContain('R0_REF');
  });

  it('re-evaluates after edits instead of authorizing a new state with a previous pass', async () => {
    const { config, module, root, manager, complete } = sample();
    complete();
    expect(evaluateOutputReadiness(config, module).ready).toBe(true);
    manager.setParameterValue(root, 'n', 101);
    const check = evaluateOutputReadiness(config, module);
    expect(check.ready).toBe(false);
    expect(check.issues[0].reason).toContain('out of range');
    for (const issues of await rejections(config, module)) expect(issues).toEqual(check.issues);
  });

  it('preserves module, container, parameter and reference paths through JSON definition parsing and value round trip', () => {
    const original = sample();
    const module = new BswmdParser().parseFromJson(JSON.stringify(original.module));
    original.complete();
    original.manager.setReferenceTarget(original.root, 'ref', original.root.uuid);
    const xml = exportArxml(original.config, module);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect([...doc.querySelectorAll('DEFINITION-REF')].map((n) => n.textContent)).toEqual([
      '/Supplier/Ecu/Definitions/Sample',
      '/Supplier/Ecu/Definitions/Sample/Settings',
      '/Supplier/Fields/Count',
      '/Supplier/Fields/Enabled',
      '/Supplier/Relations/Self',
    ]);
    expect(importArxml(xml, [module])).toEqual(original.config);
  });

  it('injects module rules without naming a module in core, then shares the same action result', async () => {
    const { config, module, complete } = sample();
    complete();
    const check = evaluateOutputReadiness(config, module, [
      {
        id: 'PLUGIN',
        name: 'example',
        severity: 'ERROR',
        scope: 'MODULE',
        check: () => [
          {
            ruleId: 'PLUGIN',
            severity: 'ERROR',
            path: 'Root/Number',
            message: 'Module rule requires a repair',
          },
        ],
      },
    ]);
    for (const issues of await rejections(config, module, check))
      expect(issues).toEqual(check.issues);
  });

  it('L08: the official workspace no longer reports required defaults before export, while non-default issues and JSON retrieval stay intact', async () => {
    const store = useConfigStore();
    store.createConfig();
    const expected = store.getOutputCheck();
    const required = collectContainers(store.config!, store.module!).flatMap((e) =>
      e.definition.parameters.filter((p) => !p.isOptional).map((p) => p.uuid)
    );
    expect(required.length).toBeGreaterThan(20);
    const panel = store.validate();
    // 用户裁定（2026-11-09）默认值即配置：必填参数默认值不再报 ERROR。
    for (const id of required)
      expect(panel.some((v) => v.definitionRef === id && v.severity === 'ERROR')).toBe(false);
    // 非参数类问题（CHOICE 未选候选等）继续按原语义拦截导出，且四出口问题保持一致。
    if (!expected.ready) {
      for (const format of ['arxml', 'csv'] as const) {
        let caught: unknown;
        try {
          store.exportConfig(format);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(OutputValidationError);
        expect((caught as OutputValidationError).result.issues).toEqual(expected.issues);
      }
      for (const issues of await rejections(store.config!, store.module!, store.getOutputCheck()))
        expect(issues).toEqual(expected.issues);
    }
    expect(store.exportConfig('json')).toContain('autosar-bsw-config');
    expect(panel.map((v) => ({ path: v.path, reason: v.message }))).toEqual(
      expected.issues.map((i) => ({ path: i.path, reason: i.reason }))
    );
  });

  it('official Dem emits exactly the confirmed parameter set in ARXML and C after all mandatory choices and internal references are configured', async () => {
    const store = useConfigStore();
    store.createConfig();
    const config = store.config!,
      module = store.module!,
      manager = new ConfigInstanceManager([module]);
    const choice = collectContainers(config, module).find((entry) => entry.definition.choice)!;
    const candidate = choice.definition.subContainers.find(
      (def) => def.shortName === 'DemDebounceMonitorInternal'
    )!;
    manager.selectChoice(config, choice.container.uuid, candidate.uuid);
    for (const entry of collectContainers(config, module))
      for (const p of entry.definition.parameters.filter((p) => !p.isOptional))
        manager.setParameterValue(
          entry.container,
          p.uuid,
          entry.container.parameters.get(p.uuid)!.value
        );
    confirmOfficialRequiredReferences(config, module);
    const check = store.getOutputCheck();
    expect(check.issues).toEqual([]);
    const expected = collectContainers(config, module).flatMap((entry, containerIndex) =>
      entry.definition.parameters.flatMap((p, fieldIndex) => {
        const value = entry.container.parameters.get(p.uuid)!;
        return value.isConfigured && value.value !== undefined
          ? [
              {
                ref: p.uuid,
                path: p.definitionPath!,
                value: String(value.value),
                cField: `P${fieldIndex}_${p.shortName.toUpperCase()}`,
                containerIndex,
              },
            ]
          : [];
      })
    );
    const xml = store.exportConfig('arxml'),
      doc = new DOMParser().parseFromString(xml, 'application/xml');
    const actualXml = [
      ...doc.querySelectorAll('ECUC-NUMERICAL-PARAM-VALUE, ECUC-TEXTUAL-PARAM-VALUE'),
    ].map((node) => ({
      path: node.querySelector('DEFINITION-REF')!.textContent,
      value: node.querySelector('VALUE')!.textContent,
    }));
    expect(actualXml).toEqual(expected.map((p) => ({ path: p.path, value: p.value })));
    const generator = new CGenerator(),
      source = await generator.generateSource(config, module, check);
    const header = await generator.generateHeader(config, module, check);
    const directory = resolve('.temp/task014-official-c');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, header.filename), header.content);
    writeFileSync(resolve(directory, source.filename), source.content);
    const compile = spawnSync(
      'gcc',
      [
        '-std=c11',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-pedantic',
        '-fsyntax-only',
        resolve(directory, source.filename),
      ],
      { encoding: 'utf8' }
    );
    expect(compile.error).toBeUndefined();
    expect(compile.status, compile.stderr).toBe(0);
    console.info(
      `Official Dem gcc -std=c11 -Wall -Wextra -Werror -pedantic -fsyntax-only: exit=${compile.status}`
    );
    const actualC = [...source.content.matchAll(/^\s+\.(P\d+_\w+) = (.*),$/gm)].map((match) => ({
      field: match[1],
      value: match[2],
    }));
    expect(actualC).toEqual(
      expected.map((p) => ({
        field: p.cField,
        value:
          p.value === 'true'
            ? 'TRUE'
            : p.value === 'false'
              ? 'FALSE'
              : /^[-+]?\d+(\.\d+)?$/.test(p.value)
                ? p.value
                : JSON.stringify(p.value),
      }))
    );
    expect(actualC).toHaveLength(actualXml.length);
    expect(importArxml(xml, [module]).containers).toEqual(config.containers);
    expect(store.exportConfig('csv')).toContain('DtcValue(hex)');
    console.info(
      `Official Dem output identity: ${expected.length} configured = ${actualXml.length} VALUE = ${actualC.length} C parameter fields`
    );
  });
});
