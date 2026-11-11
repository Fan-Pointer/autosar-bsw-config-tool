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
 * 采三次中位数后实测约 **82~186ms**（500 实例搜索）/ **376~644ms**（20 步撤销），
 * 随机器负载浮动，故预算 **300ms / 800ms** 对应约 **1.6~3.7× / 1.2~2.1×** 退化余量——
 * 搜索比撤销宽松，读预算时不要当成统一的 2 倍。
 * 早期按 200ms / 500ms 单次采样标定贴着实测下界，实测出现过 207ms / 546ms 的误红；
 * 上调预算会把真实退化一起放过去，因此**预算不再动**，改为用中位数消除尖峰（见下）。
 *
 * 采样口径（2026-11-11 追加）：每个用例**连续测量 3 次取中位数**再断言。
 * 原因是双峰现象——沙箱/机器级停顿（依赖优化、杀软扫描、CPU 抢占）会让单次测量瞬间
 * 涨到正常值的 3~4 倍（单次采样实测尖峰 570ms / 1178ms），而正常轮单次采样稳定在
 * 117~137ms / 359~420ms。取中位数可吃掉孤立尖峰，同时保留对真实退化的敏感度：
 * 若三次都在 900ms，中位数仍会红。
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

/** 三次测量取中位数：孤立尖峰（机器停顿）不影响结论，真实退化会同时抬高三次。 */
function median(samples: readonly number[]): number {
  return [...samples].sort((a, b) => a - b)[1]!;
}

/**
 * 打印三次原始值与中位数，返回用于断言的**中位数**。
 * @param label 指标名称。
 * @param samples 三次原始测量值（毫秒）。
 * @param budget 预算（毫秒）。
 * @returns 三次测量的中位数。
 */
function medianOf(label: string, samples: readonly number[], budget: number): number {
  const value = median(samples);
  console.info(
    `perf: ${label} 三次 ${samples.map((item) => item.toFixed(2)).join(' / ')}ms → ` +
      `中位数 ${value.toFixed(2)}ms（预算 ${budget}ms）`
  );
  return value;
}

/**
 * 只有 `npm run test:perf` 才启用严格预算：
 * - `test:verify` 必须稳定全绿，而并行跑时的耗时不是被测代码的属性（CPU 争用会翻倍）；
 * - 同时该文件仍需被 `test:verify` 收集，否则 collection guard 会判定「磁盘有、收集无」。
 */
const perfGate =
  process.env.npm_lifecycle_event === 'test:perf' || process.env.PERF_GATE === '1';

describe.skipIf(!perfGate)('渲染性能门禁（严格阈值，串行执行：npm run test:perf）', () => {
  it('renders 500-instance search results from input within 300 ms (median of 3)', async () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0],
      manager = new ConfigInstanceManager(store.modules);
    for (let i = 0; i < 499; i++)
      manager.addContainerInstance(store.config!, root.uuid, 'fixture-dem-dtc-def');
    const wrapper = mount(GlobalSearch, { global: { plugins: [ElementPlus] } });
    wrappers.push(wrapper);

    const samples: number[] = [];
    for (let round = 1; round <= 3; round++) {
      // 每轮都从空查询回到同一查询：同值重复 set 不会触发重渲染，那样后两次会退化成
      // 近 0ms 的空测量，中位数会被压低到失真的水平（等于让门禁失效）。
      await wrapper.get('[aria-label="全局搜索"]').setValue('');
      const start = performance.now();
      await wrapper.get('[aria-label="全局搜索"]').setValue('DemDtcValue');
      samples.push(performance.now() - start);
    }

    // 功能断言与性能断言同时保留：只放宽耗时等于放过功能退化。
    expect(wrapper.text()).toContain('499 条结果');
    expect(wrapper.findAll('.search-result')).toHaveLength(100);
    expect(medianOf('500 实例搜索', samples, 300)).toBeLessThanOrEqual(300);
  });

  it('renders twenty undo steps within 800 ms and restores the full configuration (median of 3)', async () => {
    const { store } = await workspace();
    const initial = exportJson(store.config!);

    const samples: number[] = [];
    for (let round = 1; round <= 3; round++) {
      // 每轮重建同样的 20 步编辑栈，保证三次测量是等价工作量。
      for (let i = 2; i <= 21; i++) store.setParameterValue('fixture-dem-dtc-value', i);
      await nextTick();
      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        store.undo();
        await nextTick();
      }
      samples.push(performance.now() - start);
      // 撤销必须真正还原配置：耗时再快也不算通过（每轮都验）。
      expect(exportJson(store.config!)).toBe(initial);
    }

    expect(medianOf('20 步撤销（含工作区渲染）', samples, 800)).toBeLessThan(800);
  });
});
