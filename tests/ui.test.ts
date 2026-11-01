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
import { useConfigStore } from '../src/stores/configStore';
import rawDefinition from '../bswmd/dem_bswmd.json';
import type { ConstraintViolation } from '../src/core/constraint/ConstraintTypes';
import type { ConfigInstance } from '../src/core/config/ConfigTypes';
import { legacy } from './helpers/definitionIndex';

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
    expect(wrapper.get(`[data-field="${legacy('ecuc-dem-attr-aging-allowed')}"]`).classes()).toContain(
      'is-required'
    );
    const dtc = mount(DynamicForm, { props: { container: definition('DemDTC') }, global: ui });
    wrappers.push(dtc);
    expect(dtc.findComponent(ElInput).exists()).toBe(true);
  });

  it('uses float controls, emits edits without mutating props and follows container/value changes', async () => {
    const data = { [legacy('ecuc-dem-debounce-time-failed')]: 0.75 };
    const wrapper = mount(DynamicForm, {
      props: { container: definition('DemDebounceTimeBaseClass'), configData: data },
      global: ui,
    });
    wrappers.push(wrapper);
    const number = wrapper.findComponent(ElInputNumber);
    expect(number.props()).toMatchObject({ min: 0.001, max: 3600, step: 0.1, modelValue: 0.75 });
    number.vm.$emit('update:modelValue', 1.25);
    expect(wrapper.emitted('parameter-change')?.[0]).toEqual([
      legacy('ecuc-dem-debounce-time-failed'),
      1.25,
    ]);
    expect(data[legacy('ecuc-dem-debounce-time-failed')]).toBe(0.75);
    await wrapper.setProps({ configData: { [legacy('ecuc-dem-debounce-time-failed')]: 2 } });
    expect(wrapper.findComponent(ElInputNumber).props('modelValue')).toBe(2);
    await wrapper.setProps({
      container: definition('DemDTCAttributes'),
      configData: { [legacy('ecuc-dem-attr-aging-allowed')]: true },
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
      definitionRef: legacy('ecuc-dem-attr-aging-allowed'),
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
    store.setParameterValue(legacy('ecuc-dem-attr-aging-allowed'), true);
    store.setReferenceTarget(legacy('ecuc-dem-attr-aging-cycleref'), cycle.uuid);
    expect(await store.saveConfig()).toBe(true);
    expect(store.isDirty).toBe(false);
    store.createConfig();
    expect(await store.loadConfig()).toBe(true);
    store.selectContainer(attributes.uuid);
    expect(store.parameterData[legacy('ecuc-dem-attr-aging-allowed')]).toBe(true);
    expect(store.referenceData[legacy('ecuc-dem-attr-aging-cycleref')]).toBe(cycle.uuid);
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
    expect(store.selectedKey).toContain(legacy('ecuc-dem-dtc-attributes-ref'));
    const attributes = store.entries.find(
      (entry) => entry.definition.shortName === 'DemDTCAttributes'
    )!.container;
    wrapper
      .findComponent(DynamicForm)
      .vm.$emit('reference-change', legacy('ecuc-dem-dtc-attributes-ref'), attributes.uuid);
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

  it('shows a real create action in the empty workspace and opens a named set with the DTC guide', async () => {
    const { store, wrapper } = await workspace();
    expect(store.config).toBeNull();
    expect(wrapper.text()).toContain('暂无配置集');
    const control = wrapper.findComponent(ConfigSetManager);
    await control
      .findAll('button')
      .find((button) => button.text() === '新建配置集')!
      .trigger('click');
    await nextTick();
    const dialog = document.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector<HTMLInputElement>('input[aria-label="配置集名称"]')!;
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
      .find((button) => button.text() === '新增子项')!
      .trigger('click');
    await flushPromises();
    const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) =>
      item.textContent?.includes('选择允许的子定义')
    )!;
    const addRoot = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'DemConfigSet'
    )!;
    expect(addRoot.disabled).toBe(true);
    expect(dialog.textContent).toContain('upper multiplicity 1 reached');
  });

  it('uses confirmation for instance deletion and immediately selects its surviving parent', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    const rootUuid = store.selectedEntry!.container.uuid;
    store.addContainerInstance(legacy('ecuc-dem-dtc-def'));
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
        .find((item) => item.text() === '删除配置集')!;
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
    const first = store.addContainerInstance(legacy('ecuc-dem-dtc-def'))!;
    store.selectContainer(rootUuid);
    const second = store.addContainerInstance(legacy('ecuc-dem-dtc-def'))!;
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
    expect(store.selectedKey).toBe(`${first.uuid}:ecuc-dem-dtc-value`);
    expect(document.activeElement?.closest('[data-field]')?.getAttribute('data-field')).toBe(
      legacy('ecuc-dem-dtc-value')
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('opens the context menu for the clicked container with the same lifecycle limits', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('界面测试');
    await nextTick();
    const root = wrapper.findAll('.node-label').find((item) => item.text() === 'DemConfigSet')!;
    await root.trigger('contextmenu', { clientX: 100, clientY: 150 });
    await nextTick();
    expect(wrapper.find('.floating-menu').exists()).toBe(true);
    expect(wrapper.get('.floating-menu').text()).toContain('定位错误');
    const remove = wrapper
      .get('.floating-menu')
      .findAll('button')
      .find((item) => item.text() === '删除实例')!;
    expect(remove.attributes('disabled')).toBeDefined();
    expect(store.selectedEntry?.container.shortName).toBe('DemConfigSet');
    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.floating-menu').exists()).toBe(false);
  });

  it('saves edits when returning home and opens the persisted set through the home list', async () => {
    const { store, wrapper, router } = await workspace();
    await store.createConfigSet('首页恢复测试');
    store.setParameterValue(legacy('ecuc-dem-general-max-number-event'), 77);
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
    expect(store.parameterData[legacy('ecuc-dem-general-max-number-event')]).toBe(77);
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
