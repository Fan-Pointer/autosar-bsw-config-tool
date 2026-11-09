import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import InstanceListView, {
  type InstanceListGroup,
} from '../src/ui/FormEditor/InstanceListView.vue';
import { useReferenceDataStore } from '../src/stores/referenceDataStore';

vi.mock('localforage', () => {
  const saved = new Map<string, unknown>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => saved.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        saved.set(key, JSON.parse(JSON.stringify(value)));
        return value;
      }),
      __saved: saved,
    },
  };
});

const localforage = (await import('localforage')).default as unknown as {
  getItem: (key: string) => Promise<unknown>;
  setItem: (key: string, value: unknown) => Promise<unknown>;
};

const groups: InstanceListGroup[] = [
  {
    definition: {
      uuid: 'def-dtc',
      shortName: 'DemDTC',
      multiplicity: { lower: 0, upper: 'unbounded' },
      parameters: [
        { uuid: 'p-value', shortName: 'DemDtcValue', type: 'INTEGER' },
        { uuid: 'p-text', shortName: 'FixtureText', type: 'STRING' },
      ],
      references: [],
      subContainers: [],
    } as unknown as InstanceListGroup['definition'],
    rows: [
      { uuid: 'i-1', shortName: 'DemDTC_0', values: { 'p-value': 1, 'p-text': 'hello' } },
      { uuid: 'i-2', shortName: 'DemDTC_1', values: { 'p-value': 2 } },
    ],
  },
];

describe('G31 instance list view', () => {
  it('renders rows with parameter columns, hides a column via settings, and opens rows', async () => {
    const wrapper = mount(InstanceListView, { props: { groups }, global: { plugins: [ElementPlus] } });
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('DemDTC_0');
    expect(wrapper.text()).toContain('hello');
    // containerName is a fixed column; the instance name opens the row.
    await wrapper.get('button.row-name').trigger('click');
    expect(wrapper.emitted('open')?.[0]).toEqual(['i-1']);
    // Column settings: hide FixtureText (el-dialog needs a flush after opening).
    await wrapper.get('button[aria-label="列设置 DemDTC"]').trigger('click');
    await flushPromises();
    // Vue 事件需走 test-utils 的 setValue（原生 dispatch 不触发 @change）。
    await wrapper.findAll('.column-option input[type=checkbox]')[1].setValue(false);
    await flushPromises();
    expect(wrapper.text()).not.toContain('hello');
  });

  it('supports row checking and emits batch-edit with the checked uuids', async () => {
    const wrapper = mount(InstanceListView, {
      props: { groups },
      global: { plugins: [ElementPlus] },
    });
    await wrapper.findAll('tbody input[type="checkbox"]')[0].setValue(true);
    await wrapper.findAll('tbody input[type="checkbox"]')[1].setValue(true);
    await wrapper.get('button[aria-label="批量编辑 DemDTC"]').trigger('click');
    expect(wrapper.emitted('batch-edit')?.[0]).toEqual([['i-1', 'i-2']]);
  });
});

beforeEach(() => {
  // 清 localforage mock 的跨用例残留（saved Map 为模块级闭包，经 __saved 暴露）。
  (localforage as unknown as { __saved: Map<string, unknown> }).__saved.clear();
});

describe('G38 reference data archive (minimum viable)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function makeFile(name: string, content: string): File {
    const file = new File([content], name, { type: 'text/plain' });
    // jsdom 的 File 缺 arrayBuffer：补 polyfill。
    if (typeof file.arrayBuffer !== 'function') {
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new TextEncoder().encode(content).buffer,
      });
    }
    return file;
  }

  it('identifies DBC/LDF by content or extension, archives and removes without touching the config library', async () => {
    const store = useReferenceDataStore();
    await store.initialize();
    expect(store.files).toHaveLength(0);
    const dbc = await store.importFile(makeFile('can.dbc', 'VERSION ""\n\nNS_ :\n'));
    expect(dbc.kind).toBe('DBC');
    const ldf = await store.importFile(makeFile('bus.ldf', 'LIN_description_file;'));
    expect(ldf.kind).toBe('LDF');
    const cdd = await store.importFile(makeFile('diag.cdd', 'PK\x03\x04 binary-ish'));
    expect(cdd.kind).toBe('CDD');
    expect(cdd.note).toContain('后续版本');
    expect(store.files).toHaveLength(3);
    await store.remove(dbc.id);
    expect(store.files).toHaveLength(2);
    // Independent storage key: the config library is never touched.
    const stored = (await localforage.getItem('autosar-reference-data')) as unknown[];
    expect((stored ?? []).some((item) => (item as { name: string }).name === 'bus.ldf')).toBe(true);
    expect((stored ?? []).some((item) => (item as { name: string }).name === 'diag.cdd')).toBe(true);
  });

  it('rejects unknown formats with a clear reason and never archives them', async () => {
    const store = useReferenceDataStore();
    await store.initialize();
    await expect(store.importFile(makeFile('notes.txt', 'hello'))).rejects.toThrow(
      '无法识别的参考数据格式'
    );
    expect(store.files).toHaveLength(0);
  });
});
