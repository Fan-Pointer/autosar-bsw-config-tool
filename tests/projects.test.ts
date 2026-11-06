import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import { useConfigStore } from '../src/stores/configStore';
import ProjectWizard from '../src/ui/Projects/ProjectWizard.vue';
import HomeView from '../src/views/HomeView.vue';
import PendingView from '../src/views/PendingView.vue';
import ConfiguratorStartView from '../src/views/ConfiguratorStartView.vue';
import type { ProjectInput } from '../src/stores/projectMetadata';

const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => db.data.get(key) ?? null,
      setItem: db.write,
    }),
  },
}));
const libraryKey = 'autosar-config-sets-v3',
  projectsKey = 'autosar-projects';
const input: ProjectInput = {
  name: '车身控制器',
  autosarVersion: '4.4.0',
  chip: { family: 'S32K3XX', note: '台架验证' },
  moduleShortNames: ['Dem', 'CanIf', 'NvM'],
};
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  db.data.clear();
  db.write.mockReset();
  db.write.mockImplementation(async (key: string, value: unknown) => {
    db.data.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
});

describe('project metadata with real shipped definitions', () => {
  it('creates three module configurations without file import, restores and switches projects without cross-selection', async () => {
    const store = useConfigStore();
    expect(await store.createProject(input)).toBe(true);
    const first = store.projects[0];
    expect(first.setUuids).toHaveLength(3);
    expect(store.configSets.map((s) => s.moduleRef)).toEqual(['Dem', 'CanIf', 'NvM']);
    expect(store.configSets.every((s) => s.version === '4.4.0')).toBe(true);
    const dem = store.module!;
    expect(dem.$source?.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await store.createProject({ ...input, name: '第二工程', moduleShortNames: ['Dem'] })
    ).toBe(true);
    const second = store.activeProject!.projectUuid;
    expect(store.projects).toHaveLength(2);
    await store.openProject(first.projectUuid);
    expect(store.activeUuid).toBe(first.setUuids[0]);
    expect(store.activeProject?.name).toBe(input.name);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    expect(await restored.initialize()).toBe(true);
    expect(restored.projects[0]).toEqual(first);
    expect(restored.configSets).toHaveLength(4);
    expect(restored.activeProject?.projectUuid).toBe(first.projectUuid);
    await restored.openProject(second);
    expect(restored.activeProject?.name).toBe('第二工程');
    expect(restored.module?.$source?.contentSha256).toBe(dem.$source?.contentSha256);
  });

  it('keeps old configurations in a virtual default project with zero load writes; removing grouping never deletes sets', async () => {
    const store = useConfigStore();
    await store.createConfigSet('已有工程');
    const original = JSON.stringify(db.data.get(libraryKey));
    db.write.mockClear();
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    expect(restored.unassignedSets.map((s) => s.name)).toEqual(['已有工程']);
    expect(db.write).not.toHaveBeenCalled();
    expect(JSON.stringify(db.data.get(libraryKey))).toBe(original);
    await restored.createProject(input);
    const beforeRemoval = JSON.stringify(db.data.get(libraryKey));
    const id = restored.projects[0].projectUuid;
    expect(await restored.removeProject(id)).toBe(true);
    expect(restored.unassignedSets).toHaveLength(4);
    expect(JSON.stringify(db.data.get(libraryKey))).toBe(beforeRemoval);
  });

  it('tolerates orphan associations without rewriting them and protects malformed metadata', async () => {
    db.data.set(projectsKey, {
      schemaVersion: 1,
      projects: [
        { ...input, projectUuid: 'orphan', setUuids: ['missing'], createdAt: '2026-11-06' },
      ],
    });
    const store = useConfigStore();
    await store.initialize();
    expect(store.projectWarnings[0]).toContain('1 个配置集暂不可用');
    expect(await store.openProject('orphan')).toBe(false);
    expect(db.write).not.toHaveBeenCalled();
    db.data.set(projectsKey, { unexpected: ['keep me'] });
    setActivePinia(createPinia());
    const invalid = useConfigStore();
    await invalid.initialize();
    expect(invalid.projectError).toContain('工程索引');
    expect(await invalid.createProject(input)).toBe(false);
    expect(db.data.get(projectsKey)).toEqual({ unexpected: ['keep me'] });
    expect(db.data.has(libraryKey)).toBe(false);
  });

  it('rolls back association and memory on a library write failure, and refuses stale sidecars', async () => {
    const store = useConfigStore();
    await store.initialize();
    db.write.mockImplementation(async (key: string, value: unknown) => {
      if (key === libraryKey) throw new Error('磁盘写入失败');
      db.data.set(key, JSON.parse(JSON.stringify(value)));
      return value;
    });
    expect(await store.createProject(input)).toBe(false);
    expect(store.projectError).toContain('磁盘写入失败');
    expect(store.projects).toEqual([]);
    expect(store.configSets).toEqual([]);
    expect(db.data.get(projectsKey)).toBeNull();
    expect(db.data.has(libraryKey)).toBe(false);
    db.data.set(projectsKey, { schemaVersion: 1, projects: [], otherTab: true });
    expect(await store.createProject(input)).toBe(false);
    expect(store.projectError).toContain('其他页面改变');
    expect(db.data.get(projectsKey)).toEqual({ schemaVersion: 1, projects: [], otherTab: true });
  });

  it('rejects unsupported releases and original-library locks without sidecar writes', async () => {
    const store = useConfigStore();
    await store.initialize();
    await expect(store.createProject({ ...input, autosarVersion: '4.2.2' })).rejects.toThrow(
      '待接入'
    );
    store.dataSafety.locked = true;
    store.dataSafety.reason = '原库需要恢复';
    await expect(store.createProject(input)).rejects.toThrow('DATA_LOCKED');
    await expect(store.removeProject('x')).rejects.toThrow('DATA_LOCKED');
    expect(db.write).not.toHaveBeenCalled();
  });
});

describe('project wizard and portal navigation', () => {
  it('opens the start page without resuming an existing project and imports only into a new configuration', async () => {
    const store = useConfigStore();
    await store.createProject(input);
    const active = store.activeUuid;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/configurator', component: ConfiguratorStartView },
        { path: '/workspace', component: { template: '<p>编辑工作区</p>' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      { attachTo: document.body, global: { plugins: [router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    db.write.mockClear();
    await wrapper.get('.catalog-primary').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/configurator');
    expect(wrapper.get('h1').text()).toBe('从一个工程开始');
    expect(store.activeUuid).toBe(active);
    expect(db.write).not.toHaveBeenCalled();
    await wrapper
      .findAll('aside button')
      .find((b) => b.text() === '导入工程')!
      .trigger('click');
    await wrapper.findAll('.import-formats button')[0].trigger('click');
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector<HTMLSelectElement>('[aria-label="导入目标"]')!.value).toBe('new');
    expect(dialog.querySelector('option[value="current"]')).toBeNull();
    expect(db.write).not.toHaveBeenCalled();
    await router.push('/');
    await flushPromises();
    await wrapper.get('.project-row .row-open').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/workspace');
    expect(store.activeProject?.name).toBe(input.name);
  });

  it('keeps both wizard steps transient on cancel, and creates selected real modules on confirm', async () => {
    const store = useConfigStore();
    await store.initialize();
    const wrapper = mount(ProjectWizard, {
      props: { modelValue: true },
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const dialog = () => document.querySelector('[role=dialog]')!;
    const fill = async () => {
      const name = dialog().querySelector<HTMLInputElement>('[aria-label="工程名称"]')!;
      name.value = input.name;
      name.dispatchEvent(new Event('input', { bubbles: true }));
      dialog()
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushPromises();
    };
    expect(dialog().querySelector('option[value="4.2.2"]')?.hasAttribute('disabled')).toBe(true);
    await fill();
    expect(dialog().textContent).toContain('CanIf');
    expect(db.write).not.toHaveBeenCalled();
    [...dialog().querySelectorAll('button')].find((b) => b.textContent?.trim() === '取消')!.click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(db.write).not.toHaveBeenCalled();
    for (const name of ['CanIf', 'NvM']) {
      const checkbox = dialog().querySelector<HTMLInputElement>(`[aria-label="选择 ${name}"]`)!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPromises();
    }
    dialog()
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(store.projects[0].moduleShortNames).toEqual(['Dem', 'CanIf', 'NvM']);
    expect(wrapper.emitted('opened')).toHaveLength(1);
  });

  it('uses the new brand and real routes, with return navigation from both pending pages', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/knowledge', component: PendingView, props: { title: '知识库' } },
        { path: '/subscription', component: PendingView, props: { title: '订阅中心' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      { global: { plugins: [router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('航海科技');
    expect(wrapper.text()).toContain('OneSAR Configurator');
    expect(wrapper.text()).not.toMatch(/EasySAR|昂辉|团队协作/);
    expect(wrapper.findAll('a[href^="http"]')).toHaveLength(0);
    for (const path of ['/knowledge', '/subscription']) {
      await wrapper.get(`.catalog-side a[href="${path}"]`).trigger('click');
      await flushPromises();
      expect(wrapper.get('h1').text()).toBe('待更新');
      await wrapper.get('.pending a').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/');
    }
  });
});
