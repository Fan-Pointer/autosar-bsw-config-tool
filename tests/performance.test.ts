import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import GlobalSearch from '../src/ui/Search/GlobalSearch.vue';
import { useConfigStore } from '../src/stores/configStore';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { exportJson } from '../src/core/io/ConfigJson';

/**
 * 渲染性能门禁。
 *
 * 与 editor-ui.test.ts 的分工：那边只做「功能断言 + 计时软告警」，因为全量并行跑时
 * CPU 争用会让同样的操作耗时翻倍；真正的预算判定放在这里，由
 * `npm run test:perf`（vitest run tests/performance.test.ts --no-file-parallelism）串行执行。
 *
 * 阈值口径（2026-11-11 标定）：预算用于捕捉**数量级退化**，不是精确性能指标。
 * 串行实测约 150ms（500 实例搜索）/ 390ms（20 步撤销），同机不同负载下波动可达 ±40%；
 * 早期按 200ms / 500ms 标定贴着实测下界，实测出现过 207ms / 546ms 的误红。
 * 现取实测的约 2 倍（300ms / 800ms）：翻倍退化必红，正常抖动不红。
 *
 * ⚠️ 发版前必须执行 `npm run test:perf`。该门禁是 opt-in（不塞进 test:verify：
 * 否则全量时间翻倍，且 jsdom 抖动会污染主套件），因此 CI / 发版清单需显式包含此命令。
 * 在主套件（test:verify）里本文件的用例被 `describe.skipIf` 跳过，只保留收集位。
 */

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
// 只替换输入定义，store / parser / IO / history / UI 全部为真实实现。
vi.mock('../bswmd/dem_bswmd.json?raw', async () => ({
  default: JSON.stringify((await import('./fixtures/synthetic-dem.json')).default),
}));

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  saved.clear();
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

/** 挂载真实工作区（含元素树与表单渲染），供渲染耗时测量使用。 */
async function workspace(count = 1) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useConfigStore();
  store.createConfig();
  const root = store.config!.containers[0];
  const manager = new ConfigInstanceManager(store.modules);
  const ids: string[] = [];
  for (let i = 0; i < count; i++)
    ids.push(manager.addContainerInstance(store.config!, root.uuid, 'fixture-dem-dtc-def').uuid);
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
  return { wrapper, store };
}

/**
 * 只有 `npm run test:perf` 才启用严格预算：
 * - `test:verify` 必须稳定全绿，而并行跑时的耗时不是被测代码的属性（CPU 争用会翻倍）；
 * - 同时该文件仍需被 `test:verify` 收集，否则 collection guard 会判定「磁盘有、收集无」。
 */
const perfGate =
  process.env.npm_lifecycle_event === 'test:perf' || process.env.PERF_GATE === '1';

describe.skipIf(!perfGate)('渲染性能门禁（严格阈值，串行执行：npm run test:perf）', () => {
  it('renders 500-instance search results within 300 ms from input', async () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0],
      manager = new ConfigInstanceManager(store.modules);
    for (let i = 0; i < 499; i++)
      manager.addContainerInstance(store.config!, root.uuid, 'fixture-dem-dtc-def');
    const wrapper = mount(GlobalSearch, { global: { plugins: [ElementPlus] } });
    wrappers.push(wrapper);
    const start = performance.now();
    await wrapper.get('[aria-label="全局搜索"]').setValue('DemDtcValue');
    const elapsed = performance.now() - start;
    // 功能断言与性能断言同时保留：只放宽耗时等于放过功能退化。
    expect(wrapper.text()).toContain('499 条结果');
    expect(wrapper.findAll('.search-result')).toHaveLength(100);
    console.info(`perf: 500 实例搜索 ${elapsed.toFixed(2)}ms（预算 300ms）`);
    expect(elapsed).toBeLessThanOrEqual(300);
  });

  it('renders twenty undo steps within 800 ms and restores the full configuration', async () => {
    const { store } = await workspace();
    const initial = exportJson(store.config!);
    for (let i = 2; i <= 21; i++) store.setParameterValue('fixture-dem-dtc-value', i);
    await nextTick();
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      store.undo();
      await nextTick();
    }
    const elapsed = performance.now() - start;
    // 撤销必须真正还原配置：耗时再快也不算通过。
    expect(exportJson(store.config!)).toBe(initial);
    console.info(`perf: 20 步撤销（含工作区渲染）${elapsed.toFixed(2)}ms（预算 800ms）`);
    expect(elapsed).toBeLessThan(800);
  });
});
