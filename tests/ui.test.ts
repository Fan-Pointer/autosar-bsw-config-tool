import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, {
  ElInputNumber,
  ElSelect,
  ElSwitch,
  ElInput,
  ElMessageBox,
} from 'element-plus';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { indexDefinitions } from '../src/core/config/ConfigTraversal';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ConfigTree from '../src/ui/ConfigTree/ConfigTree.vue';
import ValidationPanel from '../src/ui/Validator/ValidationPanel.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import HomeView from '../src/views/HomeView.vue';
import ConfigSetManager from '../src/ui/ConfigSets/ConfigSetManager.vue';
import ContainerActions from '../src/ui/ConfigTree/ContainerActions.vue';
import ContainerContextMenu from '../src/ui/ConfigTree/ContainerContextMenu.vue';
import ContainerNavigator from '../src/ui/ConfigTree/ContainerNavigator.vue';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { readFileSync } from 'node:fs';
import { useConfigStore } from '../src/stores/configStore';
import rawDefinition from './fixtures/synthetic-dem.json';
import type { ConstraintViolation } from '../src/core/constraint/ConstraintTypes';
import type { ConfigInstance } from '../src/core/config/ConfigTypes';
import { completeDemArxml } from './helpers/completeDemArxml';

const local = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));
vi.mock('localforage', () => ({
  default: { createInstance: () => ({ getItem: local.getItem, setItem: local.setItem }) },
}));

const wrappers: VueWrapper[] = [];
const module = new BswmdParser().parseFromJson(JSON.stringify(rawDefinition));
const definition = (name: string) => {
  return [...indexDefinitions(module).values()].find((item) => item.shortName === name)!;
};
function addOptionalContainers(config: ConfigInstance): void {
  const manager = new ConfigInstanceManager([module]);
  for (const child of module.containers[0].subContainers) {
    manager.addContainerInstance(config, config.containers[0].uuid, child.uuid);
  }
}
const ui = { plugins: [ElementPlus] };
beforeEach(() => {
  local.saved.clear();
  local.getItem.mockImplementation(async (key: string) => local.saved.get(key) ?? null);
  local.setItem.mockImplementation(async (key: string, value: unknown) => {
    // A JSON round trip also exercises the browser's localStorage fallback representation.
    local.saved.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('definition-driven components', () => {
  it('renders enum, boolean, numeric and string controls with required markers and bounds', () => {
    const container = definition('DemDTCAttributes');
    const wrapper = mount(DynamicForm, { props: { container }, global: ui });
    wrappers.push(wrapper);
    expect(wrapper.findComponent(ElSwitch).exists()).toBe(true);
    expect(wrapper.findComponent(ElSelect).exists()).toBe(true);
    expect(wrapper.findComponent(ElInputNumber).props()).toMatchObject({
      min: 1,
      max: 256,
      step: 1,
      precision: 0,
    });
    expect(wrapper.get(`[data-field="${'fixture-dem-attr-aging-allowed'}"]`).classes()).toContain(
      'is-required'
    );
    const dtc = mount(DynamicForm, { props: { container: definition('DemDTC') }, global: ui });
    wrappers.push(dtc);
    expect(dtc.findComponent(ElInput).exists()).toBe(true);
  });

  it('uses float controls, emits edits without mutating props and follows container/value changes', async () => {
    const data = { ['fixture-dem-debounce-time-failed']: 0.75 };
    const wrapper = mount(DynamicForm, {
      props: { container: definition('DemDebounceTimeBasedClass'), configData: data },
      global: ui,
    });
    wrappers.push(wrapper);
    const number = wrapper.findComponent(ElInputNumber);
    expect(number.props()).toMatchObject({ min: 0.001, max: 3600, step: 0.1, modelValue: 0.75 });
    number.vm.$emit('update:modelValue', 1.25);
    expect(wrapper.emitted('parameter-change')?.[0]).toEqual([
      'fixture-dem-debounce-time-failed',
      1.25,
    ]);
    expect(data['fixture-dem-debounce-time-failed']).toBe(0.75);
    await wrapper.setProps({ configData: { ['fixture-dem-debounce-time-failed']: 2 } });
    expect(wrapper.findComponent(ElInputNumber).props('modelValue')).toBe(2);
    await wrapper.setProps({
      container: definition('DemDTCAttributes'),
      configData: { ['fixture-dem-attr-aging-allowed']: true },
    });
    expect(wrapper.findComponent(ElSwitch).props('modelValue')).toBe(true);
    await wrapper.setProps({ readonly: true });
    wrapper.findComponent(ElSwitch).vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('parameter-change')).toHaveLength(1);
  });

  it('renders recursive tree nodes, multiplicities and distinct parameter/reference icons', async () => {
    const config = new ConfigInstanceManager().createFromBswmd(module);
    addOptionalContainers(config);
    const wrapper = mount(ConfigTree, { props: { module, config }, global: ui });
    wrappers.push(wrapper);
    await nextTick();
    expect(wrapper.text()).toContain('0..n');
    expect(wrapper.text()).toContain('DemOperationCycleType');
    expect(wrapper.findAllComponents({ name: 'Document' }).length).toBeGreaterThan(0);
    expect(wrapper.findAllComponents({ name: 'Link' }).length).toBeGreaterThan(0);
    const node = wrapper.findAll('.node-label').find((item) => item.text() === 'DemAgingAllowed');
    expect(node).toBeDefined();
    await node!.trigger('click');
    expect(wrapper.emitted('node-click')?.[0]?.[0]).toMatchObject({
      type: 'parameter',
      containerUuid: config.containers[0].subContainers[1].uuid,
      definitionRef: 'fixture-dem-attr-aging-allowed',
    });
  });

  it('displays all severities and emits navigation and validation events', async () => {
    const violations: ConstraintViolation[] = ['ERROR', 'WARNING', 'INFO'].map((severity, i) => ({
      ruleId: `RULE-${i}`,
      severity: severity as ConstraintViolation['severity'],
      path: `Root/Field${i}`,
      message: `Message ${i}`,
      suggestion: `Fix ${i}`,
      containerUuid: 'target',
    }));
    const wrapper = mount(ValidationPanel, { props: { violations, validated: true }, global: ui });
    wrappers.push(wrapper);
    for (const severity of ['error', 'warning', 'info'])
      expect(wrapper.find(`.severity-${severity}`).exists()).toBe(true);
    expect(wrapper.text()).toContain('RULE-0');
    expect(wrapper.text()).toContain('Root/Field0');
    expect(wrapper.text()).toContain('Fix 0');
    await wrapper.get('.severity-error').trigger('click');
    expect(wrapper.emitted('navigate')?.[0]).toEqual([violations[0]]);
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('validate')).toHaveLength(1);
  });
});

describe('workspace integration and local persistence', () => {
  it('round-trips recursive Maps, references and values through local storage', async () => {
    const store = useConfigStore();
    store.createConfig();
    addOptionalContainers(store.config!);
    const attributes = store.entries.find(
      (entry) => entry.definition.shortName === 'DemDTCAttributes'
    )!.container;
    const cycle = store.entries.find(
      (entry) => entry.definition.shortName === 'DemOperationCycle'
    )!.container;
    store.selectContainer(attributes.uuid);
    store.setParameterValue('fixture-dem-attr-aging-allowed', true);
    store.setReferenceTarget('fixture-dem-attr-aging-cycleref', cycle.uuid);
    expect(await store.saveConfig()).toBe(true);
    expect(store.isDirty).toBe(false);
    store.createConfig();
    expect(await store.loadConfig()).toBe(true);
    store.selectContainer(attributes.uuid);
    expect(store.parameterData['fixture-dem-attr-aging-allowed']).toBe(true);
    expect(store.referenceData['fixture-dem-attr-aging-cycleref']).toBe(cycle.uuid);
    expect(store.selectedEntry?.container.parameters).toBeInstanceOf(Map);
    expect(store.selectedEntry?.container.references).toBeInstanceOf(Map);
  });

  it('reports storage failures without claiming a save succeeded', async () => {
    const store = useConfigStore();
    store.createConfig();
    local.setItem.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await store.saveConfig()).toBe(false);
    expect(store.isDirty).toBe(true);
    expect(store.error).toBe('storage unavailable');
  });

  it('navigates from a real violation to the field and generates C after fixing the reference', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useConfigStore();
    store.createConfig();
    addOptionalContainers(store.config!);
    completeDemArxml(store.config!, store.module!);
    const incompleteDtc = store.config!.containers[0].subContainers[0];
    new ConfigInstanceManager([store.module!]).setReferenceTarget(
      incompleteDtc,
      'fixture-dem-dtc-attributes-ref',
      ''
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: WorkspaceView }],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      { global: { plugins: [pinia, router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    const validate = wrapper.findAll('button').find((button) => button.text() === '验证');
    await validate!.trigger('click');
    expect(wrapper.find('.severity-error').exists()).toBe(true);
    await wrapper.get('.severity-error').trigger('click');
    await nextTick();
    expect(store.selectedEntry?.definition.shortName).toBe('DemDTC');
    expect(store.selectedKey).toContain('fixture-dem-dtc-attributes-ref');
    const attributes = store.entries.find(
      (entry) => entry.definition.shortName === 'DemDTCAttributes'
    )!.container;
    wrapper
      .findComponent(DynamicForm)
      .vm.$emit('reference-change', 'fixture-dem-dtc-attributes-ref', attributes.uuid);
    await nextTick();
    expect(store.violations).toEqual([]);
    const generate = wrapper
      .findAll('button')
      .find((button) => button.text().includes('生成 C 代码'));
    await generate!.trigger('click');
    await vi.waitFor(() => expect(wrapper.findAll('.generated-code')).toHaveLength(2));
    expect(wrapper.text()).toContain('Dem_Cfg.h');
    expect(wrapper.text()).toContain('#ifndef DEM_CFG_H');
  });
});

describe('TASK-003 user interactions', () => {
  async function answerConfirmation(label: string): Promise<void> {
    await flushPromises();
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('.el-message-box__btns button'),
    ];
    const button = buttons.reverse().find((item) => item.textContent?.trim() === label);
    expect(button).toBeDefined();
    button!.click();
    await flushPromises();
  }

  async function workspace() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useConfigStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/workspace', component: WorkspaceView },
      ],
    });
    await router.push('/workspace');
    const wrapper = mount(
      { template: '<router-view />' },
      {
        attachTo: document.body,
        global: { plugins: [pinia, router, ElementPlus] },
      }
    );
    wrappers.push(wrapper);
    await flushPromises();
    return { store, wrapper, router };
  }

  it('no longer exposes the instance name input (user request 2026-11-09) and still persists set names', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('Rename verification');
    await flushPromises();
    // 用户 2026-11-09 裁定：去掉参数区「实例名称」整行。
    expect(wrapper.find('#instance-name').exists()).toBe(false);
    expect(store.selectedEntry).toBeTruthy();
    expect(await store.saveConfig()).toBe(true);
    expect(JSON.stringify(local.saved.get('autosar-config-sets-v3'))).toContain(
      'Rename verification'
    );
  });

  it('shows a real create action in the empty workspace and opens a named set with the DTC guide', async () => {
    const { store, wrapper } = await workspace();
    expect(store.config).toBeNull();
    expect(wrapper.text()).toContain('暂无模块配置');
    const control = wrapper.findComponent(ConfigSetManager);
    await control
      .findAll('button')
      .find((button) => button.text() === '新建模块配置')!
      .trigger('click');
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector<HTMLInputElement>('input[aria-label="模块配置名称"]')!;
    input.value = '界面测试配置';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dialog
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(store.config?.name).toBe('界面测试配置');
    expect(wrapper.text()).toContain('添加第一条 DTC');
    expect(wrapper.text()).toContain('lower multiplicity 1 required');
    await wrapper.get('.empty-children summary').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '＋ 添加第一条 DTC')!
      .trigger('click');
    await flushPromises();
    expect(store.selectedEntry?.container.shortName).toBe('DemDTC');
    expect(wrapper.findComponent(DynamicForm).exists()).toBe(true);
  });

  it('opens a child-definition chooser and disables upper-bound additions at the module root', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    store.selectContainer('');
    await nextTick();
    const actions = wrapper.findComponent(ContainerActions);
    await actions
      .findAll('button')
      .find((button) => button.text() === '添加')!
      .trigger('click');
    await flushPromises();
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) =>
      item.textContent?.includes('选择允许的子定义')
    )!;
    const rootRow = [...dialog.querySelectorAll('.child-option')].find(
      (row) => row.querySelector('.child-option-name')?.textContent?.trim() === 'DemConfigSet'
    )!;
    expect(rootRow).toBeDefined();
    const addRoot = rootRow.querySelector('button')!;
    expect(addRoot.disabled).toBe(true);
    expect(dialog.textContent).toContain('upper multiplicity 1 reached');
  });

  it('uses confirmation for instance deletion and immediately selects its surviving parent', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    const rootUuid = store.selectedEntry!.container.uuid;
    store.addContainerInstance('fixture-dem-dtc-def');
    await nextTick();
    const confirm = vi.spyOn(ElMessageBox, 'confirm');
    const button = () =>
      wrapper
        .findComponent(ContainerActions)
        .findAll('button')
        .find((item) => item.text() === '删除实例')!;
    await button().trigger('click');
    await answerConfirmation('取消');
    await flushPromises();
    expect(confirm).toHaveBeenCalledOnce();
    expect(store.entries).toHaveLength(2);
    await button().trigger('click');
    await answerConfirmation('确认删除');
    await flushPromises();
    expect(store.entries).toHaveLength(1);
    expect(store.selectedEntry?.container.uuid).toBe(rootUuid);
  });

  it('requires set deletion confirmation and switches to the first remaining set', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('A');
    const first = store.activeUuid;
    await store.createConfigSet('B');
    await nextTick();
    const button = () =>
      wrapper
        .findComponent(ConfigSetManager)
        .findAll('button')
        .find((item) => item.text() === '删除模块配置')!;
    await button().trigger('click');
    await answerConfirmation('取消');
    await flushPromises();
    expect(store.configSets).toHaveLength(2);
    await button().trigger('click');
    await answerConfirmation('确认删除');
    await flushPromises();
    expect(store.activeUuid).toBe(first);
    expect(store.configSets).toHaveLength(1);
  });

  it('colors every conflicting node and focuses its exact field when a violation is clicked', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    const rootUuid = store.selectedEntry!.container.uuid;
    const first = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.setParameterValue('fixture-dem-dtc-value', 1);
    store.selectContainer(rootUuid);
    const second = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.setParameterValue('fixture-dem-dtc-value', 1);
    await nextTick();
    for (const uuid of [first.uuid, second.uuid]) {
      expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error');
    }
    const duplicate = wrapper
      .findAll('.violation-item')
      .find((item) => item.text().includes('Duplicate DTC'));
    expect(duplicate).toBeDefined();
    await duplicate!.trigger('click');
    await nextTick();
    expect(store.selectedKey).toBe(`${first.uuid}:fixture-dem-dtc-value`);
    expect(document.activeElement?.closest('[data-field]')?.getAttribute('data-field')).toBe(
      'fixture-dem-dtc-value'
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('opens the context menu for the clicked container with the same lifecycle limits', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    await nextTick();
    const root = wrapper.get(`[data-container-id="${store.selectedEntry!.container.uuid}"]`);
    await root.trigger('contextmenu', { clientX: 100, clientY: 150 });
    await nextTick();
    expect(wrapper.find('.floating-menu').exists()).toBe(true);
    expect(
      wrapper
        .get('.floating-menu')
        .findAll('[role="menuitem"]')
        .map((item) => item.text())
    ).toEqual(['新建实例›', '克隆实例', '删除实例']);
    const remove = wrapper
      .get('.floating-menu')
      .findAll('button')
      .find((item) => item.text().includes('删除实例'))!;
    expect(remove.attributes('aria-disabled')).toBe('true');
    expect(remove.attributes('title')).toBe(
      store.containerActionsFor(store.selectedEntry!.container.uuid).removalReason
    );
    expect(store.selectedEntry?.container.shortName).toBe('DemConfigSet');
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.floating-menu').exists()).toBe(false);
  });

  it('creates under the right-click instance without changing selection on open, lists every child, and supports undo/redo', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('菜单目标');
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    await nextTick();
    await wrapper
      .get(`[data-container-id="${root.uuid}"]`)
      .trigger('contextmenu', { clientX: 200, clientY: 220 });
    await flushPromises();
    expect(store.selectedEntry?.container.uuid).toBe(dtc.uuid);
    const menu = wrapper.findComponent(ContainerContextMenu);
    await menu.get('[aria-haspopup="menu"]').trigger('click');
    await flushPromises();
    expect(
      menu.findAll('[data-definition-id]').map((item) => item.attributes('data-definition-id'))
    ).toEqual(module.containers[0].subContainers.map((item) => item.uuid));
    expect(menu.get('.parent-actions').text()).toContain('克隆实例');
    expect(menu.findAll('.child-menu')).toHaveLength(1); // one adjacent submenu, never duplicates
    await menu.get('[data-definition-id="fixture-dem-dtc-def"]').trigger('click');
    await flushPromises();
    const added = store.selectedEntry!.container.uuid;
    expect(store.config!.containers[0].subContainers.map((item) => item.uuid)).toEqual([
      dtc.uuid,
      added,
    ]);
    expect(
      store.entries.find((item) => item.container.uuid === dtc.uuid)!.container.subContainers
    ).toEqual([]);
    expect(wrapper.find('.container-context-menu').exists()).toBe(false);
    store.undo();
    expect(store.config!.containers[0].subContainers.map((item) => item.uuid)).toEqual([dtc.uuid]);
    store.redo();
    expect(store.config!.containers[0].subContainers.map((item) => item.uuid)).toEqual([
      dtc.uuid,
      added,
    ]);
  });

  it('opens children on hover, bridges fast pointer movement and collapses after leaving both regions', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('悬停菜单');
    await nextTick();
    await wrapper
      .get(`[data-container-id="${store.config!.containers[0].uuid}"]`)
      .trigger('contextmenu');
    await flushPromises();
    const menu = wrapper.findComponent(ContainerContextMenu);
    const parent = menu.get('[aria-haspopup="menu"]');
    local.setItem.mockClear();
    await parent.trigger('pointerenter');
    await flushPromises();
    expect(menu.findAll('.child-menu')).toHaveLength(1);
    expect(parent.attributes('aria-expanded')).toBe('true');
    vi.useFakeTimers();
    try {
      await parent.trigger('pointerleave');
      await vi.advanceTimersByTimeAsync(200);
      await menu.get('.child-menu').trigger('pointerenter');
      await vi.advanceTimersByTimeAsync(400);
      expect(menu.findAll('.child-menu')).toHaveLength(1);
      await menu.get('.child-menu').trigger('pointerleave');
      await vi.advanceTimersByTimeAsync(299);
      expect(menu.find('.child-menu').exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(menu.find('.child-menu').exists()).toBe(false);
      expect(local.setItem).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
    await parent.trigger('pointerenter');
    await flushPromises();
    await menu.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();
    expect(document.activeElement?.closest('.child-menu')).not.toBeNull();
    await menu.trigger('keydown', { key: 'ArrowLeft' });
    await flushPromises();
    expect(menu.find('.child-menu').exists()).toBe(false);
    expect(document.activeElement).toBe(parent.element);
  });

  it('never borrows the previous instance for a definition context menu', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('定义右键');
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    await nextTick();
    const saved = JSON.stringify(store.config);
    const marker = wrapper.get('[data-node-id="root:definition:fixture-dem-configset-def"]');
    await marker.trigger('contextmenu');
    await flushPromises();
    const menu = wrapper.findComponent(ContainerContextMenu);
    expect(menu.text()).not.toContain('这是容器定义');
    expect(menu.findAll('button[aria-disabled="true"]')).toHaveLength(3);
    for (const item of menu.findAll('button[aria-disabled="true"]')) {
      expect(item.attributes('title')).toBe('请右键实例节点');
      expect(item.attributes('aria-description')).toBe('请右键实例节点');
      await item.trigger('click');
    }
    expect(store.selectedEntry?.container.uuid).toBe(dtc.uuid);
    expect(JSON.stringify(store.config)).toBe(saved);
  });

  it('clones and deletes the explicit context target, closes before confirmation, and cancel writes nothing', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('确认语义');
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    await nextTick();
    const openDtc = async () => {
      await wrapper.get(`[data-container-id="${dtc.uuid}"]`).trigger('contextmenu');
      await flushPromises();
      return wrapper.findComponent(ContainerContextMenu);
    };
    const menu = await openDtc();
    await menu
      .findAll('button')
      .find((item) => item.text().includes('克隆实例'))!
      .trigger('click');
    await flushPromises();
    expect(store.config!.containers[0].subContainers).toHaveLength(2);
    expect(store.selectedEntry?.container.uuid).not.toBe(dtc.uuid);
    const before = JSON.stringify(store.config);
    local.setItem.mockClear();
    const deleting = await openDtc();
    await deleting
      .findAll('button')
      .find((item) => item.text().includes('删除实例'))!
      .trigger('click');
    await flushPromises();
    expect(wrapper.find('.container-context-menu').exists()).toBe(false);
    expect(document.querySelector('.el-message-box')?.textContent).toContain(dtc.shortName);
    await answerConfirmation('取消');
    expect(JSON.stringify(store.config)).toBe(before);
    expect(local.setItem).not.toHaveBeenCalled();
    const again = await openDtc();
    await again
      .findAll('button')
      .find((item) => item.text().includes('删除实例'))!
      .trigger('click');
    await answerConfirmation('确认删除');
    expect(store.entries.some((item) => item.container.uuid === dtc.uuid)).toBe(false);
    store.undo();
    expect(store.entries.some((item) => item.container.uuid === dtc.uuid)).toBe(true);
  });

  it('supports arrows, Home/End, Enter, Escape, empty children and focus restoration', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('键盘菜单');
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    await nextTick();
    const node = wrapper.get(`[data-container-id="${dtc.uuid}"]`);
    await node.trigger('contextmenu');
    await flushPromises();
    const menu = wrapper.findComponent(ContainerContextMenu);
    await menu.trigger('keydown', { key: 'ArrowRight' });
    await flushPromises();
    expect(menu.text()).toContain('此容器没有子定义');
    await menu.trigger('keydown', { key: 'ArrowLeft' });
    await flushPromises();
    await menu.trigger('keydown', { key: 'End' });
    expect(document.activeElement?.textContent).toContain('删除实例');
    await menu.trigger('keydown', { key: 'Home' });
    expect(document.activeElement?.textContent).toContain('新建');
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('克隆实例');
    await menu.trigger('keydown', { key: 'ArrowUp' });
    await menu.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(menu.attributes('aria-label')).toBe('新建子容器');
    await menu.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
    expect(document.activeElement).toBe(node.element.closest('[role="treeitem"]'));
  });

  it('keeps error location in the problem panel after removing the context-menu shortcut', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('错误定位目标');
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    await nextTick();
    await wrapper.get(`[data-container-id="${dtc.uuid}"]`).trigger('contextmenu');
    await flushPromises();
    const menu = wrapper.findComponent(ContainerContextMenu);
    expect(menu.text()).not.toContain('定位错误');
    await menu.trigger('keydown', { key: 'Escape' });
    await wrapper.get('[aria-label="代码验证"]').trigger('click');
    await wrapper
      .findAll('.violation-item')
      .find((item) => item.text().includes('DemDTC'))!
      .get('.locate-button')
      .trigger('click');
    await flushPromises();
    expect(store.selectedEntry?.container.uuid).toBe(dtc.uuid);
    expect(store.selectedFieldUuid).toBeDefined();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
  });

  it('closes on outside pointer, toolbar chooser opening, other dialogs, import, and configuration switch', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('关闭菜单');
    const first = store.activeUuid!;
    const open = async () => {
      await wrapper
        .get(`[data-container-id="${store.config!.containers[0].uuid}"]`)
        .trigger('contextmenu');
      await flushPromises();
      expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(true);
    };
    await open();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
    await open();
    await wrapper
      .findComponent(ContainerActions)
      .findAll('button')
      .find((item) => item.text() === '添加')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((item) =>
        item.textContent?.includes('选择允许的子定义')
      )
    ).toBe(true);
    await open();
    const modules = wrapper.findComponent({ name: 'ModuleManager' });
    modules.vm.$emit('update:modelValue', true);
    await nextTick();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
    modules.vm.$emit('update:modelValue', false);
    await nextTick();
    await open();
    store.isImporting = true;
    await nextTick();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
    store.isImporting = false;
    await store.createConfigSet('另一个配置');
    await open();
    await store.switchConfigSet(first);
    await nextTick();
    expect(wrapper.findComponent(ContainerContextMenu).exists()).toBe(false);
  });

  it('uses core CHOICE/upper-limit reasons and blocks writes while importing', async () => {
    const { store, wrapper } = await workspace();
    const nvm = importEcucModuleArxml(readFileSync('tests/fixtures/ecuc-nvm.arxml', 'utf8'), 'NvM');
    await store.importModuleDefinitions([nvm]);
    await store.createConfigSet('NvM 菜单', 'NvM');
    const group = store.entries.find((item) => item.definition.choice)!;
    store.selectChoice(group.container.uuid, group.definition.subContainers[0].uuid);
    await nextTick();
    // Target may be under another root tab; the navigator event still carries its real UUID.
    wrapper.findComponent(ContainerNavigator).vm.$emit('context', new MouseEvent('contextmenu'), {
      type: 'instance',
      containerUuid: group.container.uuid,
    });
    await flushPromises();
    let menu = wrapper.findComponent(ContainerContextMenu);
    await menu.get('[aria-haspopup="menu"]').trigger('click');
    await flushPromises();
    const options = store.containerActionsFor(group.container.uuid).childOptions;
    expect(options.length).toBeGreaterThan(1);
    for (const option of options) {
      const row = menu.get(`[data-definition-id="${option.definition.uuid}"]`);
      expect(row.attributes('aria-disabled')).toBe('true');
      expect(row.text()).toBe(option.definition.shortName);
      expect(row.attributes('title')).toBe(option.disabledReason);
      expect(row.attributes('aria-description')).toBe(option.disabledReason);
      expect(option.disabledReason).toContain('CHOICE');
    }
    const before = JSON.stringify(store.config);
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement?.getAttribute('aria-description')).toContain('CHOICE');
    await menu.trigger('keydown', { key: 'Enter' });
    expect(JSON.stringify(store.config)).toBe(before);
    for (const row of menu.findAll('[data-definition-id]')) await row.trigger('click');
    expect(JSON.stringify(store.config)).toBe(before);
    store.isImporting = true;
    await nextTick();
    wrapper.findComponent(ContainerNavigator).vm.$emit('context', new MouseEvent('contextmenu'), {
      type: 'instance',
      containerUuid: group.container.uuid,
    });
    await flushPromises();
    menu = wrapper.findComponent(ContainerContextMenu);
    expect(menu.get('[aria-haspopup="menu"]').attributes('title')).toContain(
      '正在应用导入，请稍后编辑'
    );
    expect(menu.get('[aria-haspopup="menu"]').attributes('aria-disabled')).toBe('true');
    expect(() =>
      store.addContainerInstance(group.definition.subContainers[0].uuid, group.container.uuid)
    ).toThrow('正在应用导入');
    store.isImporting = false;
  });

  it.skip(/* 首页已按用户 2026-11-10 裁定改为只列工程，待按新规则重写 */ 'saves edits when returning home and opens the persisted set through the home list', async () => {
    const { store, wrapper, router } = await workspace();
    await store.createConfigSet('首页恢复测试');
    store.setParameterValue('fixture-dem-general-max-number-event', 77);
    await router.push('/');
    await flushPromises();
    expect(wrapper.findComponent(HomeView).exists()).toBe(true);
    expect(store.isDirty).toBe(false);
    expect(wrapper.text()).toContain('首页恢复测试');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '打开')!
      .trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/workspace');
    expect(store.parameterData['fixture-dem-general-max-number-event']).toBe(77);
  });

  it('derives warning/error/green tree markers only from the supplied engine diagnostics', async () => {
    const config = new ConfigInstanceManager().createFromBswmd(module);
    const uuid = config.containers[0].uuid;
    const warning: ConstraintViolation = {
      ruleId: 'TEST',
      severity: 'WARNING',
      message: 'warning',
      path: '',
      containerUuid: uuid,
    };
    const wrapper = mount(ConfigTree, {
      props: { module, config, violations: [warning] },
      global: ui,
    });
    wrappers.push(wrapper);
    expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-warning');
    await wrapper.setProps({ violations: [{ ...warning, severity: 'ERROR' }] });
    expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-error');
    await wrapper.setProps({ violations: [] });
    expect(wrapper.get(`[data-node-id="${uuid}"]`).classes()).toContain('status-configured');
  });
});

// Only the input definition is replaced. Store, parser, IO, history and UI remain real.
// Official 4.4.0 integration is covered separately by core/ecuc/choice/recovery tests.
vi.mock('../bswmd/dem_bswmd.json?raw', async () => ({
  default: JSON.stringify((await import('./fixtures/synthetic-dem.json')).default),
}));
