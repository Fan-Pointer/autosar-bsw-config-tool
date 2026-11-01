import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import { HistoryStack } from '../src/core/history/HistoryStack';
import { useConfigStore } from '../src/stores/configStore';
import { exportJson, importJson, serializeConfig, hydrateConfig } from '../src/core/io/ConfigJson';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { stripDoctype, decodeXmlText } from '../src/core/io/XmlSafety';
import { buildSearchIndex, searchConfigurations } from '../src/core/search/ConfigSearch';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { commonParameters, batchSkipReason } from '../src/core/config/BatchEdit';
import { initializeTheme, setTheme } from '../src/ui/Theme/theme';
import { completeDemArxml } from './helpers/completeDemArxml';
import { legacy } from './helpers/definitionIndex';

const saved = vi.hoisted(() => new Map<string, unknown>());
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => saved.get(key),
      setItem: async (key: string, value: unknown) => {
        saved.set(key, value);
        return value;
      },
    }),
  },
}));
beforeEach(() => {
  saved.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(count = 1) {
  const store = useConfigStore();
  store.createConfig();
  const root = store.config!.containers[0];
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    store.selectContainer(root.uuid);
    ids.push(store.addContainerInstance(legacy('ecuc-dem-dtc-def'))!.uuid);
  }
  store.selectContainer(ids[0]);
  return { store, root, ids };
}

describe('bounded editor history', () => {
  it('evicts FIFO, preserves labels/timestamps and clears redo after a branch', () => {
    const stack = new HistoryStack(20);
    let value = 0;
    for (let i = 1; i <= 21; i++) {
      value = i;
      stack.push({
        label: `修改 ${i}`,
        timestamp: i,
        undo: () => {
          value = i - 1;
        },
        redo: () => {
          value = i;
        },
      });
    }
    expect(stack.undoLabel).toBe('修改 21');
    for (let i = 0; i < 20; i++) expect(stack.undo()).toBe(true);
    expect(value).toBe(1);
    expect(stack.undo()).toBe(false);
    expect(stack.redoLabel).toBe('修改 2');
    stack.redo();
    stack.push({ label: '分支', timestamp: 22, undo() {}, redo() {} });
    expect(stack.canRedo).toBe(false);
    stack.clear();
    expect(stack.canUndo).toBe(false);
    expect(() => new HistoryStack(19)).toThrow();
  });

  it('restores byte-identical JSON after twenty undo/redo steps, including timestamps and flags', () => {
    const { store } = fixture();
    const initial = exportJson(store.config!);
    for (let i = 1; i <= 20; i++) store.setParameterValue(legacy('ecuc-dem-dtc-value'), i + 1);
    const final = exportJson(store.config!);
    const start = performance.now();
    for (let i = 0; i < 20; i++) store.undo();
    const elapsed = performance.now() - start;
    expect(exportJson(store.config!)).toBe(initial);
    expect(elapsed).toBeLessThan(500);
    console.info(`20-step undo: ${elapsed.toFixed(2)} ms`);
    for (let i = 0; i < 20; i++) store.redo();
    expect(exportJson(store.config!)).toBe(final);
  });

  it('undoes value/add/reference/delete across types without dangling targets and replays exact UUIDs', () => {
    const { store, root, ids } = fixture();
    const initial = exportJson(store.config!);
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 42);
    store.selectContainer(root.uuid);
    const target = store.addContainerInstance(legacy('ecuc-dem-dtc-attributes-def'))!;
    store.selectContainer(ids[0]);
    store.setReferenceTarget(legacy('ecuc-dem-dtc-attributes-ref'), target.uuid);
    store.removeContainerInstance(target.uuid);
    expect(store.violations.some((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toBe(true);
    const final = exportJson(store.config!);
    for (let i = 0; i < 4; i++) store.undo();
    expect(exportJson(store.config!)).toBe(initial);
    expect(store.violations.some((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toBe(false);
    for (let i = 0; i < 4; i++) store.redo();
    expect(exportJson(store.config!)).toBe(final);
  });

  it('refreshes validation after undo, including invalid in-progress values', () => {
    const { store } = fixture();
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), -1);
    expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(true);
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 42);
    expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(false);
    store.undo();
    expect(store.violations.some((v) => v.definitionRef === legacy('ecuc-dem-dtc-value'))).toBe(true);
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 'unfinished');
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 42);
    store.undo();
    expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe('unfinished');
  });

  it('isolates histories by configuration set and resets the imported/reloaded set history', async () => {
    const { store, ids } = fixture();
    const first = store.activeUuid!;
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 42);
    await store.createConfigSet('Second');
    expect(store.canUndo).toBe(false);
    await store.switchConfigSet(first);
    store.undo();
    store.selectContainer(ids[0]);
    expect(store.parameterData[legacy('ecuc-dem-dtc-value')]).toBe(1);
    store.redo();
    const session = store.prepareImport(store.exportConfig('json'), 'json');
    expect(await store.applyImport(session, 'overwrite')).toBe(true);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
    await store.loadConfig();
    expect(store.canUndo).toBe(false);
  });

  it('preserves ordered sibling deletion, cloning, renaming and disabled optionals through replay', () => {
    const { store, ids } = fixture(3);
    const initial = exportJson(store.config!);
    store.removeContainerInstance(ids[1]);
    store.selectContainer(ids[0]);
    store.cloneContainerInstance();
    store.renameContainer('CustomCopy');
    store.setParameterValue(legacy('ecuc-dem-dtc-j1939-node-ref'), undefined);
    const final = exportJson(store.config!);
    for (let i = 0; i < 4; i++) store.undo();
    expect(exportJson(store.config!)).toBe(initial);
    for (let i = 0; i < 4; i++) store.redo();
    expect(exportJson(store.config!)).toBe(final);
  });
});

describe('batch edits', () => {
  it('intersects by definition UUID, never by display name', () => {
    const { store } = fixture(3);
    const entries = store.entries.slice(1);
    expect(commonParameters(entries).map((p) => p.uuid)).toContain(legacy('ecuc-dem-dtc-value'));
    const other = {
      ...entries[1],
      definition: {
        ...entries[1].definition,
        parameters: entries[1].definition.parameters.slice(1),
      },
    };
    expect(commonParameters([entries[0], other]).map((p) => p.uuid)).not.toContain(
      legacy('ecuc-dem-dtc-value')
    );
    expect(commonParameters([store.entries[0], entries[0]])).toEqual([]);
  });

  it('reports 2 successes/1 disabled skip and undoes the batch as exactly one step', () => {
    const { store, ids } = fixture(3);
    const field = legacy('ecuc-dem-dtc-j1939-node-ref');
    store.selectContainer(ids[2]);
    store.setParameterValue(field, undefined);
    store.selectedContainerUuids = ids;
    const initial = exportJson(store.config!);
    const result = store.batchSetParameter(field, 'NewNode');
    expect(result.success).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain('已禁用');
    expect(store.undoLabel).toBe('批量修改 DemJ1939DTC_J1939NodeRef');
    store.undo();
    expect(exportJson(store.config!)).toBe(initial);
    store.redo();
    expect(store.selectedEntries.map((e) => e.container.parameters.get(field)?.value)).toEqual([
      'NewNode',
      'NewNode',
      undefined,
    ]);
  });

  it('restores all three values on one undo and rejects non-common, readonly, wrong-type and out-of-range writes', () => {
    const { store, ids } = fixture(3);
    store.selectedContainerUuids = ids;
    const initial = exportJson(store.config!);
    expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), 25).success).toBe(3);
    store.undo();
    expect(exportJson(store.config!)).toBe(initial);
    expect(() => store.batchSetParameter('absent', 1)).toThrow('共有');
    expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), '25').skipped).toHaveLength(3);
    expect(store.batchSetParameter(legacy('ecuc-dem-dtc-value'), -1).skipped[0]).toContain('超出范围');
    const entry = store.selectedEntries[0],
      def = entry.definition.parameters[0];
    expect(batchSkipReason(entry, { ...def, readOnly: true }, 25)).toBe('只读');
    def.readOnly = true;
    expect(store.batchSetParameter(def.uuid, 25).success).toBe(0);
    expect(exportJson(store.config!)).toBe(initial);
  });
});

describe('global search and local theme', () => {
  it('finds names, values and paths across sets, including case-insensitive literal characters', () => {
    const { store } = fixture();
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 123456);
    store.createConfig(undefined, 'Another');
    const index = buildSearchIndex(store.configSets, store.modules);
    expect(searchConfigurations(index, 'demdtcvalue')).toHaveLength(1);
    expect(searchConfigurations(index, '123456')[0].fieldUuid).toBe(legacy('ecuc-dem-dtc-value'));
    expect(searchConfigurations(index, 'DemConfigSet/DemDTC').length).toBeGreaterThan(1);
    expect(searchConfigurations(index, '.*')).toEqual([]);
    expect(searchConfigurations(index, '')).toEqual([]);
  });

  it('indexes and searches 500 instances in at most 200 ms', () => {
    const { store, root } = fixture();
    const manager = new ConfigInstanceManager(store.modules);
    for (let i = 0; i < 498; i++)
      manager.addContainerInstance(store.config!, root.uuid, legacy('ecuc-dem-dtc-def'));
    expect(collectContainers(store.config!, store.module!)).toHaveLength(500);
    const start = performance.now();
    const matches = searchConfigurations(
      buildSearchIndex(store.configSets, store.modules),
      'DemDtcValue'
    );
    const elapsed = performance.now() - start;
    expect(matches).toHaveLength(499);
    expect(elapsed).toBeLessThanOrEqual(200);
    console.info(`500-instance index + search: ${elapsed.toFixed(2)} ms`);
  });

  it('persists theme across initialization without changing dirty edits or selection', () => {
    const { store } = fixture();
    store.setParameterValue(legacy('ecuc-dem-dtc-value'), 99);
    const initial = exportJson(store.config!),
      selected = store.selectedKey;
    setTheme('dark');
    expect(initializeTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(exportJson(store.config!)).toBe(initial);
    expect(store.selectedKey).toBe(selected);
    expect(store.isDirty).toBe(true);
    setTheme('light');
  });

  it('keeps body, secondary and semantic text at WCAG contrast >= 4.5 in both palettes', () => {
    const css = fs.readFileSync('src/ui/Theme/theme.css', 'utf8');
    const luminance = (hex: string): number => {
      const c = [1, 3, 5]
        .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const blocks = [
      ...css.matchAll(/^(?::root|:root\[data-theme='dark'\])\s*\{([^}]+)\}/gm),
    ].filter((block) => /--color-text:\s*#/.test(block[1]));
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      const palette = Object.fromEntries(
        [...block[1].matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/g)].map((m) => [m[1], m[2]])
      );
      for (const foreground of ['text', 'muted', 'accent', 'success', 'warning', 'error']) {
        for (const background of ['surface', 'panel', 'selected']) {
          const a = luminance(palette[foreground]),
            b = luminance(palette[background]);
          expect(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            `${foreground}/${background}`
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe('import hardening and diagnostics', () => {
  const attacks = [
    '<!DOCTYPE AUTOSAR [<!ENTITY x SYSTEM "file:///secret">]><AUTOSAR>&x;</AUTOSAR>',
    '<!doctype AUTOSAR SYSTEM "file:///secret"><AUTOSAR/>',
    '<!   DOCTYPE AUTOSAR SYSTEM "file:///secret"><AUTOSAR/>',
    '<!DOCTYPE AUTOSAR SYSTEM "https://attacker.invalid/external.dtd"><AUTOSAR/>',
    '<!DOCTYPE AUTOSAR [<!ENTITY % ext SYSTEM "file:///secret">%ext;]><AUTOSAR/>',
    '<!DOCTYPE AUTOSAR [<!ENTITY a "aa"><!ENTITY b "&a;&a;">]><AUTOSAR>&b;</AUTOSAR>',
    '<!ENTITY x SYSTEM "file:///secret"><AUTOSAR/>',
    '<!-- <!DOCTYPE AUTOSAR SYSTEM "file:///secret"> --><AUTOSAR/>',
    '<!DOC\u200bYPE AUTOSAR SYSTEM "file:///secret"><AUTOSAR/>',
    '<AUTOSAR><![CDATA[<!ENTITY x SYSTEM "file:///secret">]]></AUTOSAR>',
    '<AUTOSAR xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///secret"/></AUTOSAR>',
  ];
  it.each(attacks)('rejects attack without file/network access: %s', (source) => {
    const read = vi.spyOn(fs, 'readFileSync');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(() => importArxml(source, [])).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('strips a complete internal declaration before parsing and decodes only builtin entities once', () => {
    const source =
      '<!DOCTYPE root [<!ENTITY x "quoted > [ ]"><!ENTITY y SYSTEM "file:///secret">]><root>&amp;lt; &quot; &apos; &lt; &gt;</root>';
    const stripped = stripDoctype(source);
    expect(stripped).toBe('<root>&amp;lt; &quot; &apos; &lt; &gt;</root>');
    const parsed = new XMLParser({ processEntities: false }).parse(stripped) as { root: string };
    expect(decodeXmlText(parsed.root)).toBe('&lt; " \' < >');
    expect(decodeXmlText('&x;')).toBe('&x;');
    expect(() => stripDoctype('<!DOCTYPE root [')).toThrow('未闭合');
    const { store } = fixture();
    const parser = vi.spyOn(XMLParser.prototype, 'parse');
    completeDemArxml(store.config!, store.module!);
    const xml = exportArxml(store.config!, store.module!);
    importArxml(xml, store.modules);
    expect(parser.mock.calls[0][0]).not.toContain('<!DOCTYPE');
  });
  it('reports actual/expected definition UUID and total occurrences for containers, parameters and references', () => {
    const { store } = fixture(2);
    for (const kind of ['container', 'parameter', 'reference']) {
      const raw = serializeConfig(store.config!);
      const items = raw.containers[0].subContainers;
      for (const item of items) {
        if (kind === 'container') item.definitionRef = 'unknown';
        else if (kind === 'parameter') item.parameters[0].definitionRef = 'unknown';
        else item.references[0].definitionRef = 'unknown';
      }
      expect(() => hydrateConfig(raw, store.modules)).toThrow(
        /实际值 unknown.*期望值 ecuc-.*出现次数 2/
      );
    }
  });
  it('preserves literal CDATA alongside ordinary builtin and numeric entities', () => {
    const { store } = fixture();
    store.setParameterValue(legacy('ecuc-dem-dtc-j1939-node-ref'), 'CDATA_SENTINEL');
    completeDemArxml(store.config!, store.module!);
    const xml = exportArxml(store.config!, store.module!).replace(
      '>CDATA_SENTINEL<',
      '><![CDATA[literal &amp; <text>]]> &amp; &#65;<'
    );
    const restored = importArxml(xml, store.modules);
    expect(
      restored.containers[0].subContainers[0].parameters.get(legacy('ecuc-dem-dtc-j1939-node-ref'))?.value
    ).toBe('literal &amp; <text> & A');
  });
  it('retains imported dangling UUIDs with field, instance and readable target prefix in violations', async () => {
    const { store, ids } = fixture();
    const incoming = importJson(exportJson(store.config!), store.modules);
    incoming.containers[0].subContainers[0].references.get(
      legacy('ecuc-dem-dtc-attributes-ref')
    )!.targetUuid = 'deadbeef-missing-target';
    const session = store.prepareImport(exportJson(incoming), 'json');
    expect(await store.applyImport(session, 'overwrite')).toBe(true);
    store.selectContainer(ids[0]);
    expect(store.danglingReferences).toContain(legacy('ecuc-dem-dtc-attributes-ref'));
    expect(store.violations.find((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toMatchObject({
      severity: 'ERROR',
      containerUuid: ids[0],
      definitionRef: legacy('ecuc-dem-dtc-attributes-ref'),
      message: 'DemDTCAttributesRef：目标不存在（deadbeef）',
    });
    store.setReferenceTarget(legacy('ecuc-dem-dtc-attributes-ref'), '');
    expect(store.danglingReferences).toEqual([]);
    store.undo();
    expect(store.danglingReferences).toHaveLength(1);
  });
});
