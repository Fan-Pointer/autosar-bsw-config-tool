import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import type { BswmdContainer } from '../src/core/bswmd/BswmdTypes';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';

/**
 * QA 验证跨模块引用「空态文案」的两个分支（S4 修复）：
 * 无工程时不能提示「请确认目标模块已加入本工程」——那是错误归因，用户手里根本没有工程。
 * 同时锁定 `hasActiveProject` 这个 prop 契约（WorkspaceView 传入 Boolean(store.activeProject)）。
 */

/** 只含一条跨模块引用的最小容器定义。 */
function externalContainer(): BswmdContainer {
  return {
    uuid: 'def.b.root',
    shortName: 'BRoot',
    definitionPath: '/AUTOSAR/EcucDefs/SupplierB/BRoot',
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references: [
      {
        uuid: 'def.b.ref',
        shortName: 'BRootRef',
        kind: 'foreign',
        isExternal: true,
        isOptional: false,
        destinationRef: '/AUTOSAR/EcucDefs/SupplierA/ARoot',
        destinationContainerType: 'ARoot',
      },
    ],
    subContainers: [],
  };
}

/** 打开引用选择弹窗（候选为空），返回弹窗里的空态文本。 */
async function emptyStateText(hasActiveProject: boolean): Promise<string> {
  const wrapper = mount(DynamicForm, {
    props: {
      container: externalContainer(),
      // 候选恒为空：模拟「工程里没有匹配容器」或「没有工程」。
      referenceOptions: { 'def.b.ref': [] },
      referenceAddOptions: {},
      hasActiveProject,
    },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  });
  await wrapper.get('[aria-label="选择 BRootRef"]').trigger('click');
  await flushPromises();
  const empty = document.querySelector('.reference-empty');
  expect(empty).not.toBeNull();
  const text = empty!.textContent ?? '';
  wrapper.unmount();
  return text;
}

describe('跨模块引用空态文案（S4）', () => {
  it('没有打开工程时提示先打开/新建工程，而不是让用户去检查目标模块', async () => {
    const text = await emptyStateText(false);
    expect(text).toContain('当前没有打开工程');
    expect(text).not.toContain('请确认目标模块已加入本工程');
  });

  it('已有工程时提示检查目标模块是否加入本工程', async () => {
    const text = await emptyStateText(true);
    expect(text).toContain('工程内没有匹配的跨模块容器');
    expect(text).not.toContain('当前没有打开工程');
  });

  it('空态里不得出现「伪造本地实例」的创建按钮', async () => {
    await emptyStateText(true);
    expect(document.querySelector('.reference-empty button')).toBeNull();
  });
});
