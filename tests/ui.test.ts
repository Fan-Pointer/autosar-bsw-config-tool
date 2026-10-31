import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElInputNumber, ElSelect, ElSwitch, ElInput } from 'element-plus';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ConfigTree from '../src/ui/ConfigTree/ConfigTree.vue';
import ValidationPanel from '../src/ui/Validator/ValidationPanel.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import { useConfigStore } from '../src/stores/configStore';
import rawDefinition from '../bswmd/dem_bswmd.json';
import type { ConstraintViolation } from '../src/core/constraint/ConstraintTypes';

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
  const config = new ConfigInstanceManager().createFromBswmd(module);
  return collectContainers(config, module).find((entry) => entry.definition.shortName === name)!
    .definition;
};
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
    expect(wrapper.get('[data-field="ecuc-dem-attr-aging-allowed"]').classes()).toContain(
      'is-required'
    );
    const dtc = mount(DynamicForm, { props: { container: definition('DemDTC') }, global: ui });
    wrappers.push(dtc);
    expect(dtc.findComponent(ElInput).exists()).toBe(true);
  });

  it('uses float controls, emits edits without mutating props and follows container/value changes', async () => {
    const data = { 'ecuc-dem-debounce-time-failed': 0.75 };
    const wrapper = mount(DynamicForm, {
      props: { container: definition('DemDebounceTimeBasedClass'), configData: data },
      global: ui,
    });
    wrappers.push(wrapper);
    const number = wrapper.findComponent(ElInputNumber);
    expect(number.props()).toMatchObject({ min: 0.001, max: 3600, step: 0.1, modelValue: 0.75 });
    number.vm.$emit('update:modelValue', 1.25);
    expect(wrapper.emitted('parameter-change')?.[0]).toEqual([
      'ecuc-dem-debounce-time-failed',
      1.25,
    ]);
    expect(data['ecuc-dem-debounce-time-failed']).toBe(0.75);
    await wrapper.setProps({ configData: { 'ecuc-dem-debounce-time-failed': 2 } });
    expect(wrapper.findComponent(ElInputNumber).props('modelValue')).toBe(2);
    await wrapper.setProps({
      container: definition('DemDTCAttributes'),
      configData: { 'ecuc-dem-attr-aging-allowed': true },
    });
    expect(wrapper.findComponent(ElSwitch).props('modelValue')).toBe(true);
    await wrapper.setProps({ readonly: true });
    wrapper.findComponent(ElSwitch).vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('parameter-change')).toHaveLength(1);
  });

  it('renders recursive tree nodes, multiplicities and distinct parameter/reference icons', async () => {
    const config = new ConfigInstanceManager().createFromBswmd(module);
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
      definitionRef: 'ecuc-dem-attr-aging-allowed',
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
    const attributes = store.entries.find(
      (entry) => entry.definition.shortName === 'DemDTCAttributes'
    )!.container;
    const cycle = store.entries.find(
      (entry) => entry.definition.shortName === 'DemOperationCycle'
    )!.container;
    store.selectContainer(attributes.uuid);
    store.setParameterValue('ecuc-dem-attr-aging-allowed', true);
    store.setReferenceTarget('ecuc-dem-attr-aging-cycleref', cycle.uuid);
    expect(await store.saveConfig()).toBe(true);
    expect(store.isDirty).toBe(false);
    store.createConfig();
    expect(await store.loadConfig()).toBe(true);
    store.selectContainer(attributes.uuid);
    expect(store.parameterData['ecuc-dem-attr-aging-allowed']).toBe(true);
    expect(store.referenceData['ecuc-dem-attr-aging-cycleref']).toBe(cycle.uuid);
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
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: WorkspaceView }],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(WorkspaceView, { global: { plugins: [pinia, router, ElementPlus] } });
    wrappers.push(wrapper);
    const validate = wrapper.findAll('button').find((button) => button.text() === '验证');
    await validate!.trigger('click');
    expect(wrapper.find('.severity-error').exists()).toBe(true);
    await wrapper.get('.severity-error').trigger('click');
    await nextTick();
    expect(store.selectedEntry?.definition.shortName).toBe('DemDTC');
    expect(store.selectedKey).toContain('ecuc-dem-dtc-attributes-ref');
    const attributes = store.entries.find(
      (entry) => entry.definition.shortName === 'DemDTCAttributes'
    )!.container;
    wrapper
      .findComponent(DynamicForm)
      .vm.$emit('reference-change', 'ecuc-dem-dtc-attributes-ref', attributes.uuid);
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
