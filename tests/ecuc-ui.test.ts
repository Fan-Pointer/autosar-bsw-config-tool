import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElSelect } from 'element-plus';
import { useConfigStore } from '../src/stores/configStore';
import { importEcucModuleArxml, listEcucModuleNames } from '../src/core/bswmd/EcucArxmlImporter';
import ModuleManager from '../src/ui/Modules/ModuleManager.vue';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ConfigTree from '../src/ui/ConfigTree/ConfigTree.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import { EcucDefinitionSession } from '../src/ui/Modules/EcucDefinitionSession';
import { exportJson } from '../src/core/io/ConfigJson';

const nvm = readFileSync('tests/fixtures/ecuc-nvm.arxml', 'utf8');
const canif = readFileSync('tests/fixtures/ecuc-canif.arxml', 'utf8');
const local = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  setItem: vi.fn(),
  getItem: vi.fn(),
}));
vi.mock('localforage', () => ({ default: { createInstance: () => local } }));
const wrappers: VueWrapper[] = [];
// The transport fake executes the real parser; actual worker bundling is checked by the build.
class ParserWorker {
  static terminated = 0;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  private source = '';
  postMessage(message: { id: number; source?: string; names?: string[] }): void {
    queueMicrotask(() => {
      try {
        if (message.source !== undefined) {
          this.source = message.source;
          this.onmessage?.({ data: { id: message.id, names: listEcucModuleNames(this.source) } });
        } else
          this.onmessage?.({
            data: {
              id: message.id,
              modules: message.names?.map((name) => importEcucModuleArxml(this.source, name)),
            },
          });
      } catch (error) {
        this.onmessage?.({ data: { id: message.id, error: String(error) } });
      }
    });
  }
  terminate(): void {
    ParserWorker.terminated++;
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  local.saved.clear();
  ParserWorker.terminated = 0;
  local.getItem.mockImplementation(async (key: string) => local.saved.get(key) ?? null);
  local.setItem.mockImplementation(async (key: string, value: unknown) => {
    local.saved.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  vi.stubGlobal('Worker', ParserWorker);
  Element.prototype.scrollIntoView = vi.fn();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function file(source: string): File {
  const result = new File([source], 'definitions.arxml');
  Object.defineProperty(result, 'text', { value: async () => source });
  return result;
}
async function workspace() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workspace', component: WorkspaceView }],
  });
  await router.push('/workspace');
  await router.isReady();
  const wrapper = mount(WorkspaceView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, router] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
async function importedStore() {
  const store = useConfigStore();
  expect(await store.importModuleDefinitions([importEcucModuleArxml(nvm, 'NvM')])).toBe(true);
  expect(await store.createConfigSet('Official NvM', 'NvM')).toBe(true);
  return store;
}

describe('official module manager and persisted editing', () => {
  it('lists every file module, imports a selected definition and renders the official tree and form', async () => {
    const store = useConfigStore();
    const wrapper = mount(ModuleManager, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const parts = [nvm, canif].map((source) =>
      source.slice(
        source.indexOf('<ECUC-MODULE-DEF '),
        source.lastIndexOf('</ECUC-MODULE-DEF>') + 18
      )
    );
    const input = wrapper.get('input[type=file]');
    Object.defineProperty(input.element, 'files', {
      value: [file(`<AUTOSAR xmlns="http://autosar.org/schema/r4.0">${parts.join('')}</AUTOSAR>`)],
    });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.find('[aria-label="导入 NvM"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="导入 CanIf"]').exists()).toBe(true);
    await wrapper.get('[aria-label="导入 NvM"]').setValue(true);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '读取选中模块')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('CHOICE');
    expect(store.modules.some((module) => module.shortName === 'NvM')).toBe(false);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '导入选中模块')!
      .trigger('click');
    await flushPromises();
    expect(store.modules.map((module) => module.shortName)).toEqual(['Dem', 'NvM']);
    expect(store.modulePreferences.NvM.included).toBe(true);
    await store.createConfigSet('Imported NvM', 'NvM');
    const view = await workspace();
    expect(view.text()).toContain('NvM');
    expect(view.findComponent(DynamicForm).exists()).toBe(true);
    const form = view.getComponent(DynamicForm);
    expect(
      form
        .findAllComponents(ElSelect)
        .some((select) => select.props('ariaLabel') === 'NvMBlockManagementType')
    ).toBe(true);
    expect(form.findAll('.is-required').length).toBeGreaterThan(0);
    expect(view.findAll('[data-container-id]').length).toBeGreaterThan(0);
  });
  it('edits a newly imported parameter, saves, reconstructs the store, and restores definitions and values', async () => {
    const store = await importedStore();
    const field = store.selectedEntry!.definition.parameters.find(
      (item) => item.shortName === 'NvMBlockJobPriority'
    )!;
    store.setParameterValue(field.uuid, 42);
    await store.saveConfig();
    const before = exportJson(store.config!);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    expect(await restored.initialize()).toBe(true);
    expect(restored.module?.shortName).toBe('NvM');
    expect(restored.parameterData[field.uuid]).toBe(42);
    expect(exportJson(restored.config!)).toBe(before);
    expect(restored.module?.arxmlExportBlockers?.length).toBeGreaterThan(0);
    // The reloaded lifecycle manager must know runtime-loaded definitions too.
    restored.selectContainer('');
    expect(
      restored.addContainerInstance(
        restored.module!.containers.find((item) => item.shortName === 'NvMBlockDescriptor')!.uuid
      )
    ).toBeDefined();
  });
  it('reports required and range errors and navigates from the real validation panel to the imported field', async () => {
    const store = await importedStore(),
      wrapper = await workspace();
    const field = store.selectedEntry!.definition.parameters.find(
      (item) => item.shortName === 'NvMBlockJobPriority'
    )!;
    store.setParameterValue(field.uuid, undefined);
    await nextTick();
    await wrapper.get('[aria-label="验证结果"]').trigger('click');
    const missing = wrapper
      .findAll('.violation-item')
      .find((item) => item.text().includes('NvMBlockJobPriority is required'))!;
    await missing.trigger('click');
    await flushPromises();
    expect(wrapper.get(`[data-field="${field.uuid}"]`).classes()).toContain('selected-field');
    store.setParameterValue(field.uuid, 256);
    await nextTick();
    expect(
      wrapper
        .findAll('.violation-item')
        .some((item) => item.text().includes('NvMBlockJobPriority is out of range'))
    ).toBe(true);
  });
  it('retains imported definitions after configuration import and a fresh store reload', async () => {
    const store = await importedStore(),
      text = store.exportConfig('json');
    expect(await store.applyImport(store.prepareImport(text, 'json', 'new'), 'overwrite')).toBe(
      true
    );
    setActivePinia(createPinia());
    const restored = useConfigStore();
    expect(await restored.initialize()).toBe(true);
    expect(restored.configSets).toHaveLength(2);
    expect(restored.module?.shortName).toBe('NvM');
  });
  it('rejects duplicate definitions and rolls back a failed definition save without disturbing edits', async () => {
    const store = useConfigStore();
    await store.initialize();
    store.createConfig();
    const before = exportJson(store.config!);
    local.setItem.mockRejectedValueOnce(new Error('quota'));
    expect(await store.importModuleDefinitions([importEcucModuleArxml(nvm, 'NvM')])).toBe(false);
    expect(store.modules.map((module) => module.shortName)).toEqual(['Dem']);
    expect(exportJson(store.config!)).toBe(before);
    expect(await store.importModuleDefinitions([importEcucModuleArxml(nvm, 'NvM')])).toBe(true);
    await expect(
      store.importModuleDefinitions([importEcucModuleArxml(nvm, 'NvM')])
    ).rejects.toThrow('已加载');
  });
  it('renders the official definition tree within 500 ms', async () => {
    const store = await importedStore(),
      start = performance.now();
    const tree = mount(ConfigTree, {
      props: { module: store.module!, config: store.config!, mixed: true },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(tree);
    await nextTick();
    const elapsed = performance.now() - start;
    expect(tree.text()).toContain('NvMBlockDescriptor');
    expect(elapsed).toBeLessThan(500);
    console.info(`official NvM first tree render (jsdom): ${elapsed.toFixed(2)} ms`);
  });
  it('terminates parser workers after dialog close and handles rejected sources', async () => {
    const session = new EcucDefinitionSession();
    await expect(session.open(file('<AUTOSAR>broken'))).rejects.toThrow();
    session.dispose();
    expect(ParserWorker.terminated).toBe(1);
    const wrapper = mount(ModuleManager, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const input = wrapper.get('input[type=file]');
    Object.defineProperty(input.element, 'files', { value: [file(nvm)] });
    await input.trigger('change');
    await flushPromises();
    await wrapper.setProps({ modelValue: false });
    expect(ParserWorker.terminated).toBe(2);
  });
});

describe('D3 reference empty state', () => {
  it('names the missing target, creates and assigns it, and undoes the entire operation', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Reference test');
    store.addContainerInstance('ecuc-dem-dtc-def');
    const wrapper = await workspace();
    await wrapper.get('[aria-label="选择 DemDTCAttributesRef"]').trigger('click');
    await flushPromises();
    const dialog = document.querySelector('.reference-empty')!;
    expect(dialog.textContent).toContain('暂无 DemDTCAttributes 实例，请先新增');
    const before = exportJson(store.config!);
    (dialog.querySelector('button') as HTMLButtonElement).click();
    await nextTick();
    expect(store.referenceData['ecuc-dem-dtc-attributes-ref']).not.toBe('');
    expect(store.entries.some((entry) => entry.definition.shortName === 'DemDTCAttributes')).toBe(
      true
    );
    store.undo();
    await nextTick();
    expect(exportJson(store.config!)).toBe(before);
  });
  it('explains why cross-module targets cannot be created instead of making invalid local instances', async () => {
    const store = await importedStore();
    store.selectContainer('');
    store.addContainerInstance(
      store.module!.containers.find((item) => item.references.length)!.uuid
    );
    const entry = store.entries.find((item) => item.definition.references.length)!;
    store.selectContainer(entry.container.uuid);
    const wrapper = await workspace(),
      reference = entry.definition.references[0];
    await wrapper.get(`[aria-label="选择 ${reference.shortName}"]`).trigger('click');
    await flushPromises();
    expect(document.querySelector('.reference-empty')?.textContent).toContain(
      `暂无 ${reference.destinationContainerType} 实例，请先新增`
    );
    expect(document.querySelector('.reference-empty')?.textContent).toContain(
      '跨模块目标当前不可创建'
    );
    expect(document.querySelector('.reference-empty button')).toBeNull();
  });
});
