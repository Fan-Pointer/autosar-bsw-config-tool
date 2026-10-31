import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElMessageBox } from 'element-plus';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { planRequiredDefaults } from '../src/core/config/RequiredDefaults';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { exportJson } from '../src/core/io/ConfigJson';
import { useConfigStore } from '../src/stores/configStore';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import ChoiceSelector from '../src/ui/FormEditor/ChoiceSelector.vue';
import RequiredDefaultsAction from '../src/ui/FormEditor/RequiredDefaultsAction.vue';

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
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  ElMessageBox.close();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function officialStore() {
  const store = useConfigStore();
  await store.importModuleDefinitions([
    importEcucModuleArxml(readFileSync('tests/fixtures/ecuc-nvm.arxml', 'utf8'), 'NvM'),
  ]);
  store.createConfig('NvM');
  return store;
}
async function workspace() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: WorkspaceView }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(
    { template: '<router-view />' },
    { attachTo: document.body, global: { plugins: [ElementPlus, router] } }
  );
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
function ctrlZ() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
  );
}

async function answerConfirmation(label: string): Promise<void> {
  await flushPromises();
  const dialogs = document.querySelectorAll('.el-message-box');
  const dialog = dialogs[dialogs.length - 1];
  const button = [...dialog.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === label
  );
  expect(button).toBeDefined();
  button!.click();
  await flushPromises();
}

describe('TASK-009 UI selection and default confirmation', () => {
  it('shows candidate buttons, confirms data loss, cancels safely and restores a switch with one Ctrl+Z', async () => {
    const store = await officialStore();
    const group = store.entries.find((e) => e.definition.choice)!;
    store.selectContainer(group.container.uuid);
    const wrapper = await workspace();
    const buttons = wrapper.getComponent(ChoiceSelector).findAll('button');
    expect(buttons).toHaveLength(2);
    const confirm = vi.spyOn(ElMessageBox, 'confirm');
    await buttons[0].trigger('click');
    await flushPromises();
    expect(confirm).not.toHaveBeenCalled();
    expect(store.selectedEntry!.container.subContainers[0].definitionRef).toBe(
      group.definition.subContainers[0].uuid
    );
    const before = exportJson(store.config!);
    await buttons[1].trigger('click');
    await flushPromises();
    expect(confirm.mock.calls[0][0]).toContain('将丢失「NvMEaRef」的配置');
    expect(document.querySelector('.el-message-box')?.textContent).toContain(
      '将丢失「NvMEaRef」的配置'
    );
    await answerConfirmation('取消');
    expect(exportJson(store.config!)).toBe(before);
    await buttons[1].trigger('click');
    await answerConfirmation('确认切换');
    expect(store.undoLabel).toBe('切换 CHOICE 候选');
    expect(store.selectedEntry!.container.subContainers.map((c) => c.definitionRef)).toEqual([
      group.definition.subContainers[1].uuid,
    ]);
    const switched = exportJson(store.config!);
    ctrlZ();
    await nextTick();
    expect(exportJson(store.config!)).toBe(before);
    expect(store.selectedEntry!.container.uuid).toBe(group.container.uuid);
    store.redo();
    expect(exportJson(store.config!)).toBe(switched);
  });
  it('confirms only actual default values across all 37 required NvM parameters in one undo operation', async () => {
    const store = await officialStore();
    const before = exportJson(store.config!);
    const required = store.entries.flatMap((e) =>
      e.definition.parameters.filter((p) => !p.isOptional)
    );
    expect(required).toHaveLength(37);
    const defaults = required.filter((p) => p.defaultValue !== undefined);
    const wrapper = await workspace();
    await wrapper.getComponent(RequiredDefaultsAction).get('button').trigger('click');
    await nextTick();
    expect(wrapper.getComponent(RequiredDefaultsAction).text()).toContain(
      `本次已确认 ${defaults.length} 项`
    );
    expect(wrapper.getComponent(RequiredDefaultsAction).text()).toContain(
      `剩余 ${37 - defaults.length} 个必填参数`
    );
    for (const { container, definition } of store.entries)
      for (const p of definition.parameters) {
        const actual = container.parameters.get(p.uuid)!;
        if (!p.isOptional && p.defaultValue !== undefined) {
          expect(actual.isConfigured).toBe(true);
          expect(actual.value).toEqual(p.defaultValue);
        } else expect(actual.isConfigured).toBe(false);
      }
    expect(store.undoLabel).toBe('一键确认建议值');
    const after = exportJson(store.config!);
    ctrlZ();
    await nextTick();
    expect(exportJson(store.config!)).toBe(before);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(exportJson(store.config!)).toBe(after);
    console.info(
      `NvM defaults UI: required=37, confirmed=${defaults.length}, remaining=${37 - defaults.length}, one Ctrl+Z restores exact JSON`
    );
  });
  it('accepts explicit false/zero/empty defaults, preserves edits and optional fields, and creates no empty history entry', async () => {
    const module: BswmdModule = {
      shortName: 'Defaults',
      version: '1',
      containers: [
        {
          uuid: 'root',
          shortName: 'Root',
          multiplicity: { lower: 1, upper: 1 },
          subContainers: [],
          references: [],
          parameters: [
            { uuid: 'zero', type: 'INTEGER', defaultValue: 0 },
            { uuid: 'false', type: 'BOOLEAN', defaultValue: false },
            { uuid: 'empty', type: 'STRING', defaultValue: '' },
            { uuid: 'manual', type: 'INTEGER' },
            { uuid: 'optional', type: 'INTEGER', defaultValue: 5, isOptional: true },
            { uuid: 'edited', type: 'INTEGER', defaultValue: 5 },
            { uuid: 'locked', type: 'INTEGER', defaultValue: 5, readOnly: true },
          ].map((p) => ({
            ...p,
            type: p.type as 'INTEGER' | 'BOOLEAN' | 'STRING',
            shortName: p.uuid,
            configClass: 'PRE_COMPILE',
            isOptional: p.isOptional ?? false,
          })),
        },
      ],
    };
    const store = useConfigStore();
    await store.importModuleDefinitions([module]);
    store.createConfig('Defaults');
    store.setParameterValue('edited', 99);
    const before = exportJson(store.config!);
    expect(planRequiredDefaults(store.config!, module).assignments).toHaveLength(3);
    expect(store.confirmRequiredDefaults()).toEqual({ confirmed: 3, remaining: 2 });
    const fields = store.config!.containers[0].parameters;
    for (const [id, value] of [
      ['zero', 0],
      ['false', false],
      ['empty', ''],
      ['edited', 99],
    ] as const)
      expect(fields.get(id)).toMatchObject({ value, isConfigured: true });
    for (const id of ['manual', 'optional', 'locked'])
      expect(fields.get(id)?.isConfigured).toBe(false);
    expect(store.confirmRequiredDefaults()).toEqual({ confirmed: 0, remaining: 2 });
    store.undo();
    expect(exportJson(store.config!)).toBe(before);
    expect(store.undoLabel).toBe('修改 edited');
  });
  it('persists selected candidates and confirmed flags through local storage reload', async () => {
    const store = await officialStore();
    const group = store.entries.find((e) => e.definition.choice)!;
    store.selectChoice(group.container.uuid, group.definition.subContainers[1].uuid);
    store.confirmRequiredDefaults();
    const before = exportJson(store.config!);
    expect(await store.saveConfig()).toBe(true);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    expect(await restored.initialize()).toBe(true);
    expect(exportJson(restored.config!)).toBe(before);
    expect(
      collectContainers(restored.config!, restored.module!).find((e) => e.definition.choice)
        ?.container.subContainers[0].definitionRef
    ).toBe(group.definition.subContainers[1].uuid);
  });
});
