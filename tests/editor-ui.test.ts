import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElSelect } from 'element-plus';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import GlobalSearch from '../src/ui/Search/GlobalSearch.vue';
import { useConfigStore } from '../src/stores/configStore';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { isHistoryShortcut } from '../src/ui/History/useHistory';
import { exportJson } from '../src/core/io/ConfigJson';
import { initializeTheme, setTheme } from '../src/ui/Theme/theme';

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
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  saved.clear();
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
  setTheme('light');
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

async function workspace(count = 1) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useConfigStore();
  store.createConfig();
  const root = store.config!.containers[0];
  const manager = new ConfigInstanceManager(store.modules);
  const ids: string[] = [];
  for (let i = 0; i < count; i++)
    ids.push(manager.addContainerInstance(store.config!, root.uuid, 'ecuc-dem-dtc-def').uuid);
  store.selectContainer(ids[0]);
  store.validate();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: WorkspaceView }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(
    { template: '<router-view />' },
    { attachTo: document.body, global: { plugins: [pinia, router, ElementPlus] } }
  );
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, store, ids, root };
}

describe('TASK-006 workspace interactions', () => {
  it('uses toolbar and Ctrl/Cmd shortcuts but preserves native input/IME/contenteditable undo', async () => {
    const { wrapper, store } = await workspace();
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeDefined();
    store.setParameterValue('ecuc-dem-dtc-value', 42);
    await nextTick();
    expect(wrapper.get('[aria-label="撤销"]').attributes('title')).toBe('撤销：修改 DemDtcValue');
    const before = exportJson(store.config!);
    const input = wrapper.get('input[aria-label="DemDtcValue"]').element;
    const native = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
    expect(exportJson(store.config!)).toBe(before);
    expect(
      isHistoryShortcut(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true })
      )
    ).toBe(false);
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.setAttribute('contenteditable', 'true');
    document.body.append(editable);
    const editEvent = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    editable.dispatchEvent(editEvent);
    editable.remove();
    expect(editEvent.defaultPrevented).toBe(false);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(store.parameterData['ecuc-dem-dtc-value']).toBe(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    await nextTick();
    expect(store.parameterData['ecuc-dem-dtc-value']).toBe(42);
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(store.parameterData['ecuc-dem-dtc-value']).toBe(1);
    await wrapper.get('[aria-label="重做"]').trigger('click');
    expect(store.parameterData['ecuc-dem-dtc-value']).toBe(42);
  });

  it('supports Ctrl/Shift selection, shared parameters, skip summaries and one-step batch undo', async () => {
    const { wrapper, store, ids } = await workspace(3);
    store.selectContainer(ids[2]);
    store.setParameterValue('ecuc-dem-dtc-j1939-node-ref', undefined);
    await nextTick();
    const node = (id: string) => wrapper.get(`[data-container-id="${id}"] .node-label`);
    await node(ids[0]).trigger('click');
    await node(ids[1]).trigger('click', { ctrlKey: true });
    expect(store.selectedContainerUuids).toEqual([ids[0], ids[1]]);
    await node(ids[0]).trigger('click');
    await node(ids[2]).trigger('click', { shiftKey: true });
    expect(store.selectedContainerUuids).toEqual(ids);
    expect(wrapper.get('[aria-label="批量修改"]').text()).toContain('已选 3 项');
    const options = wrapper
      .findAll('[aria-label="批量参数"] option')
      .map((option) => option.attributes('value'));
    expect(options).toEqual(store.batchParameters.map((p) => p.uuid));
    await wrapper.get('[aria-label="批量参数"]').setValue('ecuc-dem-dtc-j1939-node-ref');
    await wrapper.get('[aria-label="批量值"]').setValue('Updated');
    const before = exportJson(store.config!);
    await wrapper.get('[aria-label="批量修改"] .el-button').trigger('click');
    expect(wrapper.get('[role="status"]').text()).toContain('成功 2 项，跳过 1 项');
    expect(wrapper.get('[role="status"]').text()).toContain('已禁用');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    await nextTick();
    expect(exportJson(store.config!)).toBe(before);
  });

  it('marks imported dangling references in tree and form, navigates errors, clears and undoes them', async () => {
    const { wrapper, store, ids } = await workspace();
    const raw = JSON.parse(exportJson(store.config!)) as {
      configuration: {
        containers: { subContainers: { references: { targetUuid: string }[] }[] }[];
      };
    };
    raw.configuration.containers[0].subContainers[0].references[0].targetUuid = 'deadbeef-missing';
    expect(
      await store.applyImport(store.prepareImport(JSON.stringify(raw), 'json'), 'overwrite')
    ).toBe(true);
    await flushPromises();
    expect(wrapper.get(`[data-node-id="${ids[0]}"]`).classes()).toContain('status-error');
    await wrapper.get('[aria-label="验证结果"]').trigger('click');
    const violation = wrapper
      .findAll('.violation-item')
      .find((item) => item.text().includes('deadbeef'))!;
    expect(violation.exists()).toBe(true);
    await violation.trigger('click');
    await flushPromises();
    const field = wrapper.get('[data-field="ecuc-dem-dtc-attributes-ref"]');
    expect(field.classes()).toContain('dangling-reference');
    expect(field.classes()).toContain('selected-field');
    expect(field.text()).toContain('目标不存在');
    await field.get('button.clear-reference').trigger('click');
    expect(store.referenceData['ecuc-dem-dtc-attributes-ref']).toBe('');
    expect(wrapper.find('.dangling-reference').exists()).toBe(false);
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(wrapper.find('.dangling-reference').exists()).toBe(true);
    expect(store.violations.some((v) => v.ruleId === 'BSWMD-DANGLING-REFERENCE')).toBe(true);
  });

  it('refreshes both the validation panel and tree after undoing a repair', async () => {
    const { wrapper, store, ids } = await workspace();
    store.setParameterValue('ecuc-dem-dtc-value', -1);
    store.setParameterValue('ecuc-dem-dtc-value', 42);
    await wrapper.get('[aria-label="验证结果"]').trigger('click');
    expect(wrapper.findAll('.violation-item').some((v) => v.text().includes('out of range'))).toBe(
      false
    );
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(wrapper.findAll('.violation-item').some((v) => v.text().includes('out of range'))).toBe(
      true
    );
    expect(wrapper.get(`[data-node-id="${ids[0]}"]`).classes()).toContain('status-error');
  });

  it('searches across sets, highlights literal matches and focuses the selected parameter after switching', async () => {
    const { wrapper, store, ids } = await workspace();
    const first = store.activeUuid;
    await store.createConfigSet('Second set');
    store.addContainerInstance('ecuc-dem-dtc-def');
    await flushPromises();
    const input = wrapper.get('[aria-label="全局搜索"]');
    await input.setValue('DemDtcValue');
    expect(wrapper.findAll('.search-result')).toHaveLength(2);
    expect(wrapper.findAll('.search-result mark').map((mark) => mark.text())).toContain(
      'DemDtcValue'
    );
    await wrapper.findAll('.search-result')[0].trigger('click');
    await flushPromises();
    expect(store.activeUuid).toBe(first);
    expect(store.selectedEntry?.container.uuid).toBe(ids[0]);
    expect(wrapper.get('[data-field="ecuc-dem-dtc-value"]').classes()).toContain('selected-field');
    expect(document.activeElement?.id).toBe('input-ecuc-dem-dtc-value');
  });

  it('changes theme with unsaved edits and keeps them through preference reload', async () => {
    const { wrapper, store } = await workspace();
    store.setParameterValue('ecuc-dem-dtc-value', 99);
    const before = exportJson(store.config!),
      selected = store.selectedKey;
    await wrapper.get('[aria-label="切换主题"]').trigger('click');
    expect(initializeTheme()).toBe('dark');
    expect(store.isDirty).toBe(true);
    expect(store.selectedKey).toBe(selected);
    expect(exportJson(store.config!)).toBe(before);
  });

  it('renders 500-instance search results within 200 ms from input', async () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0],
      manager = new ConfigInstanceManager(store.modules);
    for (let i = 0; i < 499; i++)
      manager.addContainerInstance(store.config!, root.uuid, 'ecuc-dem-dtc-def');
    const wrapper = mount(GlobalSearch, { global: { plugins: [ElementPlus] } });
    wrappers.push(wrapper);
    const start = performance.now();
    await wrapper.get('[aria-label="全局搜索"]').setValue('DemDtcValue');
    const elapsed = performance.now() - start;
    expect(wrapper.text()).toContain('499 条结果');
    expect(wrapper.findAll('.search-result')).toHaveLength(100);
    expect(elapsed).toBeLessThanOrEqual(200);
    console.info(`500-instance input-to-render: ${elapsed.toFixed(2)} ms`);
  });

  it('exposes reference target choice through the form and records the selection', async () => {
    const { wrapper, store, ids, root } = await workspace();
    store.selectContainer(root.uuid);
    const target = store.addContainerInstance('ecuc-dem-dtc-attributes-def')!;
    store.selectContainer(ids[0]);
    await nextTick();
    await wrapper.get('[aria-label="选择 DemDTCAttributesRef"]').trigger('click');
    await flushPromises();
    const form = wrapper.getComponent(DynamicForm);
    const select = form
      .findAllComponents(ElSelect)
      .find((select) => select.props('ariaLabel') === '引用目标');
    expect(select).toBeDefined();
    select!.vm.$emit('update:modelValue', target.uuid);
    await nextTick();
    expect(store.referenceData['ecuc-dem-dtc-attributes-ref']).toBe(target.uuid);
    expect(store.undoLabel).toBe('修改引用 DemDTCAttributesRef');
  });
  it('renders twenty undo steps within 500 ms and restores the full configuration', async () => {
    const { store } = await workspace();
    const initial = exportJson(store.config!);
    for (let i = 2; i <= 21; i++) store.setParameterValue('ecuc-dem-dtc-value', i);
    await nextTick();
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      store.undo();
      await nextTick();
    }
    const elapsed = performance.now() - start;
    expect(exportJson(store.config!)).toBe(initial);
    expect(elapsed).toBeLessThan(500);
    console.info(`20-step undo with workspace rendering: ${elapsed.toFixed(2)} ms`);
  });
});
