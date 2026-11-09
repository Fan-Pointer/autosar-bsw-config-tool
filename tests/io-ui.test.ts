import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import { useConfigStore } from '../src/stores/configStore';
import { exportJson, importJson, MAX_IMPORT_BYTES } from '../src/core/io/ConfigJson';
import ImportDialog from '../src/ui/ImportExport/ImportDialog.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import { completeDemArxml } from './helpers/completeDemArxml';

const local = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));
vi.mock('localforage', () => ({ default: { createInstance: () => local } }));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  local.saved.clear();
  local.getItem.mockImplementation(async (key: string) => local.saved.get(key) ?? null);
  local.setItem.mockImplementation(async (key: string, value: unknown) => {
    local.saved.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function fixture() {
  const store = useConfigStore();
  await store.createConfigSet('IO Project');
  const rootUuid = store.config!.containers[0].uuid;
  store.addContainerInstance('fixture-dem-dtc-def');
  const dtc = store.selectedEntry!.container;
  store.setParameterValue('fixture-dem-dtc-value', 1);
  await store.saveConfig();
  const incoming = importJson(store.exportConfig('json'), store.modules);
  incoming.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')!.value = 42;
  return { store, dtc, rootUuid, text: exportJson(incoming) };
}

describe('transactional store IO', () => {
  it('allows a field removed by import to be explicitly enabled again without showing a phantom default', async () => {
    const { store, text, dtc } = await fixture();
    const file = importJson(text, store.modules);
    file.containers[0].subContainers[0].parameters.delete('fixture-dem-dtc-functional-unit');
    file.containers[0].subContainers[0].references.delete('fixture-dem-dtc-obd-ref');
    const session = store.prepareImport(exportJson(file), 'json');
    expect(store.previewImport(session, 'overwrite').deletedItems).toBe(2);
    expect(await store.applyImport(session, 'overwrite')).toBe(true);
    store.selectContainer(dtc.uuid);
    expect(store.parameterData).toHaveProperty('fixture-dem-dtc-functional-unit', undefined);
    store.setParameterValue('fixture-dem-dtc-functional-unit', 12);
    store.setReferenceTarget('fixture-dem-dtc-obd-ref', '');
    expect(store.parameterData['fixture-dem-dtc-functional-unit']).toBe(12);
    expect(store.referenceData['fixture-dem-dtc-obd-ref']).toBe('');
  });
  it('previews without mutation then commits one complete library and survives reload', async () => {
    const { store, text, dtc } = await fixture();
    const before = store.exportConfig('json'),
      saved = JSON.stringify([...local.saved]);
    const session = store.prepareImport(text, 'json');
    expect(store.previewImport(session, 'overwrite').conflicts).toHaveLength(1);
    expect(store.exportConfig('json')).toBe(before);
    expect(JSON.stringify([...local.saved])).toBe(saved);
    const calls = local.setItem.mock.calls.length;
    expect(await store.applyImport(session, 'overwrite')).toBe(true);
    expect(local.setItem.mock.calls.length).toBe(calls + 1);
    expect(
      store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value
    ).toBe(42);
    expect(store.config!.containers[0].subContainers[0].uuid).toBe(dtc.uuid);
    const after = store.exportConfig('json');
    await store.loadConfig();
    expect(store.exportConfig('json')).toBe(after);
  });
  it('restores the entire JSON into an empty library including metadata and references', async () => {
    const { store } = await fixture();
    const exported = store.exportConfig('json');
    // A new Pinia instance alone does not create an empty persisted library (S1 correctly refuses
    // to overwrite that unread library). This case explicitly models a fresh storage destination.
    local.saved.clear();
    setActivePinia(createPinia());
    const empty = useConfigStore();
    expect(await empty.applyImport(empty.prepareImport(exported, 'json', 'new'), 'overwrite')).toBe(
      true
    );
    expect(empty.exportConfig('json')).toBe(exported);
    await empty.loadConfig();
    expect(empty.exportConfig('json')).toBe(exported);
  });
  it.each(['skip', 'rename'] as const)(
    'persists the %s strategy from the same preview',
    async (strategy) => {
      const { store, text } = await fixture();
      const session = store.prepareImport(text, 'json');
      const plan = store.previewImport(session, strategy);
      expect(await store.applyImport(session, strategy)).toBe(true);
      expect(store.config!.containers).toEqual(plan.result.containers);
      await store.loadConfig();
      expect(store.config!.containers[0].subContainers).toHaveLength(strategy === 'rename' ? 2 : 1);
    }
  );
  it('leaves the exact original config, selection, dirty flag and storage after a failed write', async () => {
    const { store, text, dtc } = await fixture();
    store.setParameterValue('fixture-dem-dtc-value', 2);
    store.selectContainer(dtc.uuid, 'fixture-dem-dtc-value');
    const before = store.exportConfig('json'),
      saved = JSON.stringify([...local.saved]);
    const selection = store.selectedKey;
    const session = store.prepareImport(text, 'json');
    local.setItem.mockRejectedValueOnce(new Error('磁盘写入失败'));
    expect(await store.applyImport(session, 'overwrite')).toBe(false);
    expect(store.error).toBe('导入失败：磁盘写入失败');
    expect(store.exportConfig('json')).toBe(before);
    expect(store.selectedKey).toBe(selection);
    expect(store.isDirty).toBe(true);
    expect(JSON.stringify([...local.saved])).toBe(saved);
  });
  it('rolls back a mid-plan failure injected after successful parsing without saving a partial tree', async () => {
    const { store, text } = await fixture();
    const before = store.exportConfig('json'),
      saved = JSON.stringify([...local.saved]);
    const session = store.prepareImport(text, 'json');
    session.incoming.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')!.value =
      {
        broken: true,
      };
    const calls = local.setItem.mock.calls.length;
    expect(await store.applyImport(session, 'overwrite')).toBe(false);
    expect(store.error).toContain('参数类型');
    expect(store.exportConfig('json')).toBe(before);
    expect(JSON.stringify([...local.saved])).toBe(saved);
    expect(local.setItem.mock.calls.length).toBe(calls);
  });
  it('rejects malformed input with a readable error and protects edits made after preview', async () => {
    const { store, text } = await fixture();
    const before = store.exportConfig('json');
    expect(() => store.prepareImport('{broken', 'json')).toThrow('导入失败');
    expect(store.exportConfig('json')).toBe(before);
    const session = store.prepareImport(text, 'json');
    store.setParameterValue('fixture-dem-dtc-value', 3);
    expect(await store.applyImport(session, 'overwrite')).toBe(false);
    expect(store.error).toContain('配置集已在预览后更改');
    expect(store.selectedEntry!.container.parameters.get('fixture-dem-dtc-value')?.value).toBe(3);
  });
  it('does not publish staged state while writing and prevents concurrent editor actions', async () => {
    const { store, text } = await fixture();
    const before = store.exportConfig('json');
    let fail: (reason: Error) => void = () => {
      throw new Error('write not started');
    };
    local.setItem.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    );
    const pending = store.applyImport(store.prepareImport(text, 'json'), 'overwrite');
    await flushPromises();
    expect(store.isImporting).toBe(true);
    expect(store.exportConfig('json')).toBe(before);
    expect(() => store.setParameterValue('fixture-dem-dtc-value', 5)).toThrow('正在应用导入');
    expect(await store.saveConfig()).toBe(false);
    fail(new Error('写入中断'));
    expect(await pending).toBe(false);
    expect(store.exportConfig('json')).toBe(before);
    expect(store.isImporting).toBe(false);
  });
});

async function dialog(text: string, format: 'json' | 'arxml' = 'json') {
  const wrapper = mount(ImportDialog, {
    attachTo: document.body,
    props: { modelValue: true, format },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File([text], 'input.' + format)],
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector('.import-counts')).not.toBeNull());
  return wrapper;
}
function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.replace(/\s+/g, '') === text.replace(/\s+/g, '')
  )!;
}

describe('import preview UI and project menus', () => {
  it('renders hostile file text literally in conflicts without creating HTML elements', async () => {
    const { store, text } = await fixture();
    const file = importJson(text, store.modules);
    file.containers[0].subContainers[0].parameters.get('fixture-text-payload')!.value =
      '<img src=x onerror=alert(1)>';
    await dialog(exportJson(file));
    expect(document.querySelector('.conflict-table')?.textContent).toContain(
      '<img src=x onerror=alert(1)>'
    );
    expect(document.querySelector('.conflict-table img')).toBeNull();
  });
  it('reads an actual file, shows exactly four conflict columns in order, and cancels without saving', async () => {
    const { store, text } = await fixture();
    const before = store.exportConfig('json'),
      calls = local.setItem.mock.calls.length;
    const wrapper = await dialog(text);
    expect(
      [...document.querySelectorAll('.conflict-table th')].map((node) => node.textContent)
    ).toEqual(['冲突实例路径', '参数名', '文件生成值 / 文件引用值', '配置集值 / 配置集引用值']);
    expect(
      [...document.querySelectorAll('.conflict-table td')].map((node) => node.textContent)
    ).toEqual(['DemConfigSet/DemDTC', 'DemDtcValue', '42', '1']);
    expect((document.querySelector('input[value=overwrite]') as HTMLInputElement).checked).toBe(
      true
    );
    button('取消').click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(store.exportConfig('json')).toBe(before);
    expect(local.setItem.mock.calls.length).toBe(calls);
  });
  it.each(['overwrite', 'skip', 'rename'] as const)(
    'applies %s through the visible preview controls',
    async (strategy) => {
      const { store, text } = await fixture();
      await dialog(text);
      (document.querySelector('input[value=' + strategy + ']') as HTMLInputElement).click();
      await flushPromises();
      button('应用导入').click();
      await flushPromises();
      expect(
        store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value
      ).toBe(strategy === 'overwrite' ? 42 : 1);
      expect(store.config!.containers[0].subContainers).toHaveLength(strategy === 'rename' ? 2 : 1);
    }
  );
  it('imports ARXML through the same local file preview and renders file strings as text', async () => {
    const { store } = await fixture();
    completeDemArxml(store.config!, store.module!);
    const xml = store.exportConfig('arxml').replace('<VALUE>1</VALUE>', '<VALUE>88</VALUE>');
    await dialog(xml, 'arxml');
    button('应用导入').click();
    await flushPromises();
    expect(
      store.config!.containers[0].subContainers[0].parameters.get('fixture-dem-dtc-value')?.value
    ).toBe(88);
  });
  it('rejects oversize files before FileReader and makes application unavailable', async () => {
    const wrapper = mount(ImportDialog, {
      attachTo: document.body,
      props: { modelValue: true, format: 'json' },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', {
      value: [{ name: 'large.json', size: MAX_IMPORT_BYTES + 1 }],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('50 MB 上限');
    expect(read).not.toHaveBeenCalled();
    expect(button('应用导入').disabled).toBe(true);
  });
  it('opens import/export submenus, downloads all three formats and distinguishes module/set tooltips', async () => {
    const { store } = await fixture();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: WorkspaceView }],
    });
    await router.push('/');
    const wrapper = mount(
      { template: '<router-view />' },
      { attachTo: document.body, global: { plugins: [router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    completeDemArxml(store.config!, store.module!);
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    for (const format of ['JSON', 'ARXML', 'CSV（DTC 列表）']) {
      await wrapper.get('.project-root').trigger('contextmenu', { clientX: 100, clientY: 80 });
      button('导出›').click();
      await flushPromises();
      // G44：导出子菜单在三种单模块格式外新增两项工程级导出。
      expect(document.querySelectorAll('.io-submenu button')).toHaveLength(5);
      expect(document.querySelector('.io-submenu')!.textContent).toContain('工程 ARXML');
      expect(document.querySelector('.io-submenu')!.textContent).toContain('工程包');
      button(format).click();
      await flushPromises();
    }
    expect(click).toHaveBeenCalledTimes(3);
    expect(blobs.map((blob) => blob.type)).toEqual([
      'application/json;charset=utf-8',
      'application/xml;charset=utf-8',
      'text/csv;charset=utf-8',
    ]);
    expect(wrapper.get('.module-tab [role=tab]').attributes('title')).toBe(
      '模块：Dem · CP TEST-SYNTHETIC-1\n配置集：IO Project'
    );
    await wrapper.get('.project-root').trigger('contextmenu', { clientX: 100, clientY: 80 });
    button('导入›').click();
    await flushPromises();
    expect(document.querySelectorAll('.io-submenu button')).toHaveLength(2);
    button('JSON').click();
    await flushPromises();
    expect(document.querySelector('input[type=file]')).not.toBeNull();
    expect(store.error).toBeNull();
  });
});

// Only the input definition is replaced. Store, parser, IO, history and UI remain real.
// Official 4.4.0 integration is covered separately by core/ecuc/choice/recovery tests.
vi.mock('../bswmd/dem_bswmd.json?raw', async () => ({
  default: JSON.stringify((await import('./fixtures/synthetic-dem.json')).default),
}));
