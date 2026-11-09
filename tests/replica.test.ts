import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ContainerNavigator from '../src/ui/ConfigTree/ContainerNavigator.vue';
import ModuleManager from '../src/ui/Modules/ModuleManager.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import { useConfigStore } from '../src/stores/configStore';
import type { BswmdContainer } from '../src/core/bswmd/BswmdTypes';

const saved = vi.hoisted(() => new Map<string, unknown>());
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => saved.get(key),
      setItem: async (key: string, value: unknown) => {
        saved.set(key, JSON.parse(JSON.stringify(value)));
        return value;
      },
    }),
  },
}));
const wrappers: VueWrapper[] = [];
const container: BswmdContainer = {
  uuid: 'generic-container',
  shortName: 'Generic',
  multiplicity: { lower: 0, upper: 'unbounded' },
  references: [],
  subContainers: [],
  parameters: [
    {
      uuid: 'optional',
      shortName: 'OptionalText',
      type: 'STRING',
      configClass: 'PRE_COMPILE',
      isOptional: true,
      defaultValue: 'initial',
    },
    {
      uuid: 'number',
      shortName: 'Number',
      type: 'INTEGER',
      configClass: 'PRE_COMPILE',
      isOptional: false,
      min: 0,
      max: 255,
    },
  ],
};
beforeEach(() => {
  saved.clear();
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

describe('screenshot replica interactions', () => {
  it('preserves explicitly disabled optional values and enables through an edit event', async () => {
    const wrapper = mount(DynamicForm, {
      props: { container, configData: { optional: undefined } },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    const input = wrapper.get('[aria-label="OptionalText"]');
    expect(input.attributes('disabled')).toBeDefined();
    await wrapper.get('input[type=checkbox]').setValue(true);
    expect(wrapper.emitted('parameter-change')?.[0]).toEqual(['optional', 'initial']);
    await wrapper.setProps({ configData: { optional: 'changed' } });
    expect(wrapper.get('[aria-label="OptionalText"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('input[type=checkbox]').setValue(false);
    expect(wrapper.emitted('parameter-change')?.[1]).toEqual(['optional', undefined]);
  });

  it('edits hexadecimal as a numeric value and refuses invalid or out of range input', async () => {
    const wrapper = mount(DynamicForm, {
      props: { container, configData: { number: 32 } },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await wrapper.get('select').setValue('HEX');
    expect(wrapper.get('[aria-label="Number"]').element).toHaveProperty('value', '20');
    const number = wrapper.get('[aria-label="Number"]');
    await number.setValue('2A');
    expect(wrapper.emitted('parameter-change')?.[0]).toEqual(['number', 42]);
    await number.setValue('not hex');
    await number.setValue('FFF');
    expect(wrapper.emitted('parameter-change')).toHaveLength(1);
  });

  it('adds under a selected definition and filters mixed nodes by instance path', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Replica test');
    const parent = store.selectedEntry!.container;
    const definition = store.selectedEntry!.definition.subContainers[0];
    const wrapper = mount(ContainerNavigator, {
      props: { width: 240 },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper
      .findAll('.node-label')
      .find((item) => item.text() === definition.shortName)!
      .trigger('click');
    await wrapper.get('[aria-label="添加实例"]').trigger('click');
    await flushPromises();
    expect(store.selectedEntry?.definition.uuid).toBe(definition.uuid);
    expect(parent.subContainers).toHaveLength(1);
    expect(wrapper.findAll('.instance-icon')).toHaveLength(2);
    await wrapper.get('input[placeholder="请输入文字搜索"]').setValue('does-not-exist');
    expect(wrapper.findAll('.node-label')).toHaveLength(0);
    await wrapper
      .get('input[placeholder="请输入文字搜索"]')
      .setValue(parent.shortName + '/' + definition.shortName);
    expect(wrapper.text()).toContain(definition.shortName);
  });

  it('moves a hidden top-level tab into view when selected from overflow', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Tabs');
    const original = store.module!.containers[0];
    store.module!.containers.push(
      ...[1, 2, 3].map((index) => ({
        ...original,
        uuid: 'top-' + index,
        shortName: 'OtherRoot' + index,
      }))
    );
    const wrapper = mount(ContainerNavigator, {
      props: { width: 240 },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await wrapper.get('[aria-label="更多顶级容器"]').trigger('click');
    await flushPromises();
    const item = [...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(
      (item) => item.textContent === 'OtherRoot3'
    );
    expect(item).toBeDefined();
    item!.click();
    await flushPromises();
    expect(wrapper.get('[role=tab][aria-selected=true]').text()).toBe('OtherRoot3');
  });

  it('transfers modules and persists independent validation and generation flags', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Modules');
    const name = store.modules[0].shortName;
    const wrapper = mount(ModuleManager, {
      attachTo: document.body,
      props: { modelValue: true },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const dialog = document.querySelector('[role=dialog]')!;
    const select = dialog.querySelector<HTMLInputElement>(
      'input[aria-label="选择模块 ' + name + '"]'
    )!;
    select.click();
    await flushPromises();
    (dialog.querySelector('[aria-label="移除模块"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(dialog.querySelector('tbody tr')).toBeNull();
    (dialog.querySelector('[aria-label="选择 ' + name + '"]') as HTMLInputElement).click();
    await flushPromises();
    (dialog.querySelector('[aria-label="加入模块"]') as HTMLButtonElement).click();
    await flushPromises();
    (dialog.querySelector('input[aria-label="' + name + ' 生成"]') as HTMLInputElement).click();
    await flushPromises();
    [...dialog.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === '确定')!
      .click();
    await flushPromises();
    expect(store.getModulePreference(name, store.modules[0].version)).toEqual({
      included: true,
      generation: false,
      validation: true,
    });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    await store.loadConfig();
    expect(store.getModulePreference(name, store.modules[0].version).generation).toBe(false);
  });

  async function workspace() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: WorkspaceView }],
    });
    await router.push('/');
    const wrapper = mount(
      { template: '<router-view />' },
      { attachTo: document.body, global: { plugins: [pinia, router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    return { store: useConfigStore(), wrapper };
  }

  it('closes a module to an empty editor and reopens its saved data', async () => {
    const { store, wrapper } = await workspace();
    await store.createConfigSet('Closable');
    await flushPromises();
    const uuid = store.activeUuid;
    await wrapper.get('.close-tab').trigger('click');
    await flushPromises();
    expect(wrapper.find('.empty-editor').exists()).toBe(true);
    expect(store.config?.uuid).toBe(uuid);
    await wrapper.get('.module-node').trigger('click');
    await flushPromises();
    expect(wrapper.find('.parameter-panel').exists()).toBe(true);
    expect(store.activeUuid).toBe(uuid);
  });

  it('renders the four fixed tree branches with honest empty states (G41)', async () => {
    const { wrapper } = await workspace();
    const branches = wrapper.findAll('.fixed-branch');
    expect(branches).toHaveLength(4);
    expect(branches.map((item) => item.get('summary').text())).toEqual([
      expect.stringContaining('RTE'),
      expect.stringContaining('AUTOSAR 文件'),
      expect.stringContaining('输出文件'),
      expect.stringContaining('输入文件'),
    ]);
    // 每个空分支给出准确说明，不伪装成有内容的节点。
    expect(branches[0].text()).toContain('暂未接入');
    expect(branches[3].text()).toContain('参考数据');
  });

  it('removes empty placeholder actions, keeps real output guards and opens the module dialog', async () => {
    const { wrapper } = await workspace();
    await wrapper.get('.project-root').trigger('contextmenu', { clientX: 100, clientY: 80 });
    // 需求 v3.0 §3.2：菜单含 新建工程 + 工程管理（编辑/复制/详情）+ 模块管理 + 验证 + 生成 + 导入 + 导出 + 关闭。
    expect(wrapper.findAll('.project-menu [role=menuitem]')).toHaveLength(8);
    expect(wrapper.findAll('.project-menu button[disabled]')).toHaveLength(1);
    expect(wrapper.get('.project-menu').text()).toContain('工程管理');
    expect(wrapper.get('.project-menu').text()).not.toContain('自动计算');
    expect(wrapper.findAll('.project-folder')).toHaveLength(0);
    await wrapper
      .findAll('.project-menu button')
      .find((item) => item.text().startsWith('模块管理'))!
      .trigger('click');
    await flushPromises();
    expect(document.querySelector('.module-selector')).not.toBeNull();
  });

  it('keeps disabled optional fields absent through save and restore', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Optional persistence');
    const optional = store.selectedEntry!.definition.parameters.find((item) => item.isOptional)!;
    store.setParameterValue(optional.uuid, undefined);
    await store.saveConfig();
    await store.loadConfig();
    expect(store.parameterData).toHaveProperty(optional.uuid, undefined);
    expect(store.selectedEntry!.container.parameters.get(optional.uuid)?.isConfigured).toBe(true);
  });
});

// Only the input definition is replaced. Store, parser, IO, history and UI remain real.
// Official 4.4.0 integration is covered separately by core/ecuc/choice/recovery tests.
vi.mock('../bswmd/dem_bswmd.json?raw', async () => ({
  default: JSON.stringify((await import('./fixtures/synthetic-dem.json')).default),
}));
