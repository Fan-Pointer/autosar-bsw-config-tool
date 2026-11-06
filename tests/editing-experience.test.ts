import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDialog, ElMessageBox } from 'element-plus';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { exportJson } from '../src/core/io/ConfigJson';
import { useConfigStore } from '../src/stores/configStore';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import ChoiceSelector from '../src/ui/FormEditor/ChoiceSelector.vue';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ValidationPanel from '../src/ui/Validator/ValidationPanel.vue';

const storage = vi.hoisted(() => ({ values: new Map<string, unknown>(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => storage.values.get(key),
      setItem: async (key: string, value: unknown) => {
        storage.write(key, value);
        storage.values.set(key, value);
        return value;
      },
    }),
  },
}));
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  setActivePinia(createPinia());
  storage.values.clear();
  storage.write.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  ElMessageBox.close();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function definition(): BswmdModule {
  const leaf = (name: string, lower = 1): BswmdContainer => ({
    uuid: name,
    shortName: name,
    definitionPath: `/AUTOSAR/EcucDefs/Edit/${name}`,
    multiplicity: { lower, upper: 1 },
    parameters: [],
    references: [],
    subContainers: [],
  });
  const root = leaf('Root');
  root.multiplicity.upper = 'unbounded';
  root.parameters = [
    {
      uuid: 'flag',
      shortName: 'Enabled',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
      description: 'False is an explicit, valid configured value.',
    },
    {
      uuid: 'count',
      shortName: 'Count',
      type: 'INTEGER',
      defaultValue: 0,
      min: 0,
      max: 100,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
    {
      uuid: 'optional',
      shortName: 'OptionalText',
      type: 'STRING',
      isOptional: true,
      configClass: 'PRE_COMPILE',
    },
  ];
  root.references = [
    {
      uuid: 'memory',
      shortName: 'MemoryRef',
      destinationContainerType: 'First',
      destinationRefs: ['/AUTOSAR/EcucDefs/Edit/First', '/AUTOSAR/EcucDefs/Edit/Second'],
      kind: 'choice',
      isOptional: true,
    },
    {
      uuid: 'create',
      shortName: 'NewTargetRef',
      destinationContainerType: 'NewTarget',
      isOptional: true,
    },
    { uuid: 'inbound', shortName: 'CandidateRef', destinationContainerType: 'A', isOptional: true },
  ];
  const a = leaf('A', 0),
    b = leaf('B', 0);
  a.parameters = [
    {
      uuid: 'a-value',
      shortName: 'CandidateFlag',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
  ];
  a.references = [
    {
      uuid: 'a-ref',
      shortName: 'CandidateMemoryRef',
      destinationContainerType: 'First',
      isOptional: true,
    },
  ];
  b.parameters = [
    {
      uuid: 'b-value',
      shortName: 'OtherFlag',
      type: 'BOOLEAN',
      defaultValue: false,
      isOptional: false,
      configClass: 'PRE_COMPILE',
    },
  ];
  const group = leaf('Choice');
  group.choice = { candidateRefs: ['A', 'B'] };
  group.subContainers = [a, b];
  root.subContainers = [group];
  return {
    shortName: 'Edit',
    version: '4.4.0',
    containers: [root, leaf('First'), leaf('Second'), leaf('NewTarget', 0)],
  };
}

async function workspace() {
  const store = useConfigStore();
  await store.importModuleDefinitions([definition()]);
  await store.createConfigSet('编辑验收', 'Edit');
  const root = store.config!.containers[0];
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: WorkspaceView }],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(
    { template: '<router-view />' },
    {
      attachTo: document.body,
      global: { plugins: [ElementPlus, router], stubs: { transition: false } },
    }
  );
  wrappers.push(wrapper);
  await flushPromises();
  return { store, root, wrapper };
}
function visibleDialog() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('.el-dialog')].filter(
    (dialog) => dialog.parentElement?.parentElement?.style.display !== 'none'
  );
  return dialogs[dialogs.length - 1]!;
}
async function button(label: string, scope: ParentNode = visibleDialog()) {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label
  )!;
  expect(found).toBeDefined();
  found.click();
  await flushPromises();
}
async function pick(label: string) {
  const found = [...document.querySelectorAll<HTMLInputElement>('[role="radiogroup"] input')].find(
    (input) => input.getAttribute('aria-label') === label
  )!;
  expect(found).toBeDefined();
  found.click();
  await nextTick();
}
function messageBox() {
  const boxes = document.querySelectorAll('.el-message-box');
  return boxes[boxes.length - 1]!;
}

describe('TASK-017 editing workflows', () => {
  it('shows clicked parameter help only in the bottom dock without editing a boolean or history', async () => {
    const { store, wrapper } = await workspace();
    const before = exportJson(store.config!),
      history = store.undoLabel;
    storage.write.mockClear();
    expect(wrapper.find('.field-help').exists()).toBe(false);
    await wrapper.get('[aria-label="查看 Enabled 说明"]').trigger('click');
    const help = wrapper.get('[aria-label="参数说明面板"]');
    expect(help.isVisible()).toBe(true);
    expect(help.text()).toContain('False is an explicit, valid configured value.');
    expect(help.text()).toContain('/AUTOSAR/EcucDefs/Edit/Root/Enabled');
    expect(wrapper.get('[aria-label="问题面板"]').isVisible()).toBe(false);
    await wrapper.get('[data-field="count"]').trigger('click');
    expect(help.text()).toContain('范围：0 ～ 100');
    expect(help.text()).not.toContain('False is an explicit');
    await wrapper.get('[aria-label="收起参数说明"]').trigger('click');
    expect(wrapper.get('[aria-label="编辑器信息"]').isVisible()).toBe(false);
    await wrapper.get('[aria-label="查看 MemoryRef 说明"]').trigger('click');
    expect(help.text()).toContain('/AUTOSAR/EcucDefs/Edit/First');
    expect(help.text()).toContain('/AUTOSAR/EcucDefs/Edit/Second');
    expect(exportJson(store.config!)).toBe(before);
    expect(store.undoLabel).toBe(history);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('switches help and issues in one dock, keeps issue location visible and clears help on instance/set changes', async () => {
    const { store, wrapper } = await workspace();
    await wrapper.get('[aria-label="查看 Enabled 说明"]').trigger('click');
    await wrapper.get('[aria-label="代码验证"]').trigger('click');
    expect(wrapper.get('[aria-label="问题面板"]').isVisible()).toBe(true);
    expect(wrapper.get('[aria-label="参数说明面板"]').isVisible()).toBe(false);
    await wrapper.get('.locate-button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[aria-label="问题面板"]').isVisible()).toBe(true);
    await wrapper.get('[aria-label="查看 Enabled 说明"]').trigger('click');
    await wrapper.get('[role="tablist"][aria-label="底部信息"] [role="tab"]').trigger('click');
    expect(wrapper.get('[aria-label="参数说明面板"]').isVisible()).toBe(true);
    store.selectContainer(store.config!.containers[1].uuid);
    await nextTick();
    expect(wrapper.get('[aria-label="参数说明面板"]').text()).toContain('点击参数查看说明');
    await store.createConfigSet('切集说明', 'Edit');
    await flushPromises();
    expect(wrapper.get('[aria-label="参数说明面板"]').text()).not.toContain('False is an explicit');
    expect(wrapper.findAll('.validation-dock')).toHaveLength(1);
  });

  it('includes an output operation failure in the visible problem and error counts', () => {
    const wrapper = mount(ValidationPanel, {
      props: { validated: true, operationError: '输出模板无法加载' },
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    expect(wrapper.get('.title').text()).toContain('问题（1） · 错误 1 / 警告 0');
    expect(wrapper.get('[role="alert"]').text()).toContain('输出模板无法加载');
    expect(wrapper.text()).not.toContain('验证通过');
  });

  it.each(['cancel', 'close', 'escape', 'outside'] as const)(
    'cancels a staged reference via %s with byte-identical configuration, history and zero storage writes',
    async (way) => {
      const { store, wrapper } = await workspace();
      const before = exportJson(store.config!),
        history = store.undoLabel;
      await wrapper.get('[aria-label="选择 MemoryRef"]').trigger('click');
      await flushPromises();
      await pick('Second');
      storage.write.mockClear();
      expect(exportJson(store.config!)).toBe(before);
      if (way === 'cancel') await button('取消');
      if (way === 'close') {
        (visibleDialog().querySelector('.el-dialog__headerbtn') as HTMLButtonElement).click();
        await flushPromises();
      }
      if (way === 'escape') {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
        );
        await flushPromises();
      }
      if (way === 'outside') {
        const backdrop = visibleDialog().parentElement!;
        backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        backdrop.click();
        await flushPromises();
      }
      expect(exportJson(store.config!)).toBe(before);
      expect(store.undoLabel).toBe(history);
      expect(storage.write).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(wrapper.getComponent(DynamicForm).getComponent(ElDialog).props('modelValue')).toBe(
          false
        )
      );
      // The draft is gone: reopening must start from the committed empty value.
      await wrapper.get('[aria-label="选择 MemoryRef"]').trigger('click');
      await flushPromises();
      expect(document.querySelector<HTMLInputElement>('input[aria-label="Second"]')!.checked).toBe(
        false
      );
    }
  );

  it('searches path/name, applies only on confirm, and undo restores the complete reference state', async () => {
    const { store, wrapper } = await workspace();
    const before = exportJson(store.config!);
    await wrapper.get('[aria-label="选择 MemoryRef"]').trigger('click');
    await flushPromises();
    const search = document.querySelector<HTMLInputElement>('input[aria-label="搜索引用目标"]')!;
    search.value = 'Second';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(document.querySelector('input[aria-label="First"]')).toBeNull();
    await pick('Second');
    expect(exportJson(store.config!)).toBe(before);
    await button('确定');
    expect(store.referenceData.memory).toBe(store.config!.containers[2].uuid);
    expect(store.undoLabel).toBe('修改引用 MemoryRef');
    store.undo();
    expect(exportJson(store.config!)).toBe(before);
  });

  it('stages creation without mutation, cancels safely, then creates and references in one reversible action', async () => {
    const { store, wrapper } = await workspace();
    const before = exportJson(store.config!);
    const open = async () => {
      await wrapper.get('[aria-label="选择 NewTargetRef"]').trigger('click');
      await flushPromises();
    };
    await open();
    const createButton = document.querySelector<HTMLButtonElement>('.reference-empty button')!;
    createButton.click();
    await nextTick();
    expect(exportJson(store.config!)).toBe(before);
    storage.write.mockClear();
    await button('取消');
    expect(storage.write).not.toHaveBeenCalled();
    expect(exportJson(store.config!)).toBe(before);
    await open();
    document.querySelector<HTMLButtonElement>('.reference-empty button')!.click();
    await nextTick();
    await button('确定');
    expect(
      store.config!.containers.filter((item) => item.definitionRef === 'NewTarget')
    ).toHaveLength(1);
    expect(store.referenceData.create).toBe(
      store.config!.containers.find((item) => item.definitionRef === 'NewTarget')!.uuid
    );
    expect(store.undoLabel).toBe('新增引用目标');
    store.undo();
    expect(exportJson(store.config!)).toBe(before);
  });

  it('distinguishes unconfirmed false, confirmed false, optional absence and validator errors', async () => {
    const { store, wrapper } = await workspace();
    expect(wrapper.get('[data-field="flag"] [data-state]').attributes('data-state')).toBe(
      'unconfirmed'
    );
    expect(wrapper.get('[data-field="optional"] [data-state]').attributes('data-state')).toBe(
      'optional'
    );
    expect(
      (wrapper.get('[aria-label="启用 OptionalText"]').element as HTMLInputElement).checked
    ).toBe(false);
    await wrapper.get('[aria-label="启用 OptionalText"]').setValue(true);
    expect(store.selectedEntry!.container.parameters.get('optional')?.isConfigured).toBe(true);
    store.undo();
    store.setParameterValue('flag', false);
    await nextTick();
    expect(wrapper.get('[data-field="flag"] [data-state]').attributes('data-state')).toBe(
      'configured'
    );
    expect(store.parameterData.flag).toBe(false);
    store.undo();
    await nextTick();
    expect(wrapper.get('[data-field="flag"] [data-state]').attributes('data-state')).toBe(
      'unconfirmed'
    );
    store.setParameterValue('count', -1);
    store.validate();
    await nextTick();
    expect(wrapper.get('[data-field="count"] [data-state]').attributes('data-state')).toBe('error');
    expect(wrapper.get('[data-field="count"]').text()).toContain('out of range');
  });

  it('previews configured choice values, outgoing and inbound references; cancel writes nothing and replacement is one undo', async () => {
    const { store, root, wrapper } = await workspace();
    const group = root.subContainers[0];
    store.selectChoice(group.uuid, 'A');
    const a = group.subContainers[0];
    store.selectContainer(a.uuid);
    store.setParameterValue('a-value', false);
    store.setReferenceTarget('a-ref', store.config!.containers[1].uuid);
    store.selectContainer(root.uuid);
    store.setReferenceTarget('inbound', a.uuid);
    store.selectContainer(group.uuid);
    await nextTick();
    const before = exportJson(store.config!);
    await wrapper.getComponent(ChoiceSelector).get('[aria-label="选择候选 B"]').trigger('click');
    await flushPromises();
    const preview = document.querySelector('.choice-impact')!;
    expect(preview.textContent).toContain('CandidateFlag');
    expect(preview.textContent).toContain('false');
    expect(preview.textContent).toContain('CandidateMemoryRef');
    expect(preview.textContent).toContain('CandidateRef');
    expect(preview.textContent).toContain('目标将失效');
    storage.write.mockClear();
    await button('取消', messageBox());
    expect(exportJson(store.config!)).toBe(before);
    expect(storage.write).not.toHaveBeenCalled();
    await wrapper.getComponent(ChoiceSelector).get('[aria-label="选择候选 B"]').trigger('click');
    await flushPromises();
    await button('确认切换', messageBox());
    const b = store.selectedEntry!.container.subContainers[0];
    expect(b.definitionRef).toBe('B');
    expect(b.parameters.get('b-value')).toMatchObject({ value: false, isConfigured: false });
    expect(store.entries.some((entry) => entry.container.uuid === a.uuid)).toBe(false);
    store.undo();
    expect(exportJson(store.config!)).toBe(before);
  });

  it('opens the shared add picker from the toolbar and retains the same core limit reason without writes', async () => {
    const { store, root, wrapper } = await workspace();
    const before = exportJson(store.config!);
    storage.write.mockClear();
    await wrapper.get('[aria-label="添加实例"]').trigger('click');
    await flushPromises();
    expect(visibleDialog().textContent).toContain('父容器：Root');
    const option = store.addOptionsFor(root.uuid)[0];
    expect(option.disabledReason).toBeTruthy();
    expect(visibleDialog().textContent).toContain(option.disabledReason);
    expect(visibleDialog().querySelector<HTMLButtonElement>('.child-option button')!.disabled).toBe(
      true
    );
    (visibleDialog().querySelector('.el-dialog__headerbtn') as HTMLButtonElement).click();
    await flushPromises();
    expect(exportJson(store.config!)).toBe(before);
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('refuses a CHOICE confirmation when the configuration changed after its preview', async () => {
    const { store, root, wrapper } = await workspace();
    const group = root.subContainers[0];
    store.selectChoice(group.uuid, 'A');
    store.selectContainer(group.uuid);
    await nextTick();
    await wrapper.getComponent(ChoiceSelector).get('[aria-label="选择候选 B"]').trigger('click');
    await flushPromises();
    store.selectContainer(root.uuid);
    store.setParameterValue('count', 29);
    const afterEdit = exportJson(store.config!);
    storage.write.mockClear();
    await button('确认切换', messageBox());
    expect(exportJson(store.config!)).toBe(afterEdit);
    expect(storage.write).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('配置已变化');
  });

  it('retains the issue panel after locating a field and navigates both reference directions', async () => {
    const { store, root, wrapper } = await workspace();
    const target = store.config!.containers[1];
    store.setReferenceTarget('memory', target.uuid);
    await nextTick();
    await wrapper.get('.reference-relations button').trigger('click');
    expect(store.selectedEntry!.container.uuid).toBe(target.uuid);
    await nextTick();
    const inbound = wrapper.get('.reference-relations');
    expect(inbound.text()).toContain('入站 1');
    await inbound.get('button').trigger('click');
    expect(store.selectedEntry!.container.uuid).toBe(root.uuid);
    expect(store.selectedFieldUuid).toBe('memory');
    await wrapper.get('[aria-label="生成 C 代码"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[aria-label="问题面板"]').isVisible()).toBe(true);
    expect(wrapper.get('[aria-label="问题面板"]').text()).toContain('必填项未配置');
    await wrapper.get('.locate-button').trigger('click');
    await nextTick();
    expect(wrapper.get('[aria-label="问题面板"]').isVisible()).toBe(true);
    expect(store.selectedFieldUuid).toBeTruthy();
  });

  it('combines twenty-step undo/redo, independent sets and per-instance batch skip reasons', async () => {
    const { store } = await workspace();
    store.setParameterValue('count', 0);
    const firstUuid = store.activeUuid!,
      initial = exportJson(store.config!);
    for (let i = 1; i <= 20; i++) store.setParameterValue('count', i);
    const final = exportJson(store.config!);
    await store.createConfigSet('第二配置集', 'Edit');
    const secondUuid = store.activeUuid!;
    store.setParameterValue('count', 73);
    const second = exportJson(store.config!);
    await store.switchConfigSet(firstUuid);
    for (let i = 0; i < 20; i++) store.undo();
    expect(exportJson(store.config!)).toBe(initial);
    for (let i = 0; i < 20; i++) store.redo();
    expect(exportJson(store.config!)).toBe(final);
    await store.switchConfigSet(secondUuid);
    expect(exportJson(store.config!)).toBe(second);
    const root = store.config!.containers[0];
    store.setParameterValue('optional', 'keep');
    const added = store.addContainerInstance('Root', null)!;
    store.setParameterValue('optional', undefined);
    store.selectedContainerUuids = [root.uuid, added.uuid];
    const beforeBatch = exportJson(store.config!);
    const result = store.batchSetParameter('optional', 'batch');
    expect(result.success).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain(added.shortName);
    expect(result.skipped[0]).toContain('已禁用');
    store.undo();
    expect(exportJson(store.config!)).toBe(beforeBatch);
    await store.switchConfigSet(firstUuid);
    expect(exportJson(store.config!)).toBe(final);
  });
});
