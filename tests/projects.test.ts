import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ElMessageBox } from 'element-plus';
import ModuleManager from '../src/ui/Modules/ModuleManager.vue';
import ModuleSelector from '../src/ui/Modules/ModuleSelector.vue';
import { moduleKey } from '../src/core/bswmd/ModuleKey';
import { exportJson, importJson } from '../src/core/io/ConfigJson';
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
  vi.restoreAllMocks();
});

describe('TASK-021 version-scoped project module lifecycle', () => {
  it('creates, edits and restores real 4.2.2 and 4.4.0 Dem with independent definitions and preferences', async () => {
    const store = useConfigStore();
    for (const release of ['4.2.2', '4.4.0']) {
      expect(
        await store.createProject({
          ...input,
          name: release,
          autosarVersion: release,
          moduleShortNames: ['Dem'],
        })
      ).toBe(true);
      expect(store.config?.version).toBe(release);
      const entry = store.entries.find((e) =>
        e.definition.parameters.some((p) => p.type === 'BOOLEAN')
      )!;
      store.selectContainer(entry.container.uuid);
      const field = entry.definition.parameters.find((p) => p.type === 'BOOLEAN')!;
      store.setParameterValue(field.uuid, release === '4.2.2');
      store.modulePreferences[moduleKey('Dem', release)].generation = release !== '4.2.2';
      await store.saveConfig();
      expect(importJson(exportJson(store.config!), store.modules)).toEqual(store.config);
      store.validate();
      expect(store.violations.length).toBeGreaterThan(0);
    }
    const before = store.configSets.map(exportJson);
    setActivePinia(createPinia());
    const loaded = useConfigStore();
    db.write.mockClear();
    expect(await loaded.initialize()).toBe(true);
    expect(db.write).not.toHaveBeenCalled();
    expect(loaded.configSets.map(exportJson)).toEqual(before);
    expect(loaded.getModulePreference('Dem', '4.2.2').generation).toBe(false);
    expect(loaded.getModulePreference('Dem', '4.4.0').generation).toBe(true);
    for (const project of loaded.projects) {
      expect(await loaded.openProject(project.projectUuid)).toBe(true);
      expect(loaded.module?.version).toBe(project.autosarVersion);
      expect(loaded.config?.version).toBe(project.autosarVersion);
    }
  });

  it.skip(/* 用户 2026-11-10 裁定取消「游离配置集」：该用例测旧语义，待重写 */'adds, detaches and restores exact configurations across reload; another project is never borrowed', async () => {
    const store = useConfigStore();
    await store.createProject({ ...input, moduleShortNames: ['Dem'] });
    const first = store.activeProject!.projectUuid;
    const originalId = store.activeUuid!;
    store.renameContainer('RetainedRoot');
    await store.saveConfig();
    const original = exportJson(store.config!);
    expect(await store.updateProjectModules(first, ['Dem', 'CanIf'])).toBe(true);
    expect(store.activeProject?.moduleShortNames).toEqual(['Dem', 'CanIf']);
    expect(await store.updateProjectModules(first, ['CanIf'])).toBe(true);
    expect(store.activeProject?.moduleShortNames).toEqual(['CanIf']);
    expect(store.unassignedSets.some((s) => s.uuid === originalId)).toBe(true);
    expect(exportJson(store.configSets.find((s) => s.uuid === originalId)!)).toBe(original);
    await store.createProject({ ...input, name: 'Other', moduleShortNames: ['Dem'] });
    const other = store.activeUuid;
    setActivePinia(createPinia());
    const loaded = useConfigStore();
    await loaded.initialize();
    expect(await loaded.updateProjectModules(first, ['CanIf', 'Dem'])).toBe(true);
    expect(loaded.activeProject?.setUuids).toContain(originalId);
    expect(loaded.activeProject?.setUuids).not.toContain(other);
    expect(exportJson(loaded.configSets.find((s) => s.uuid === originalId)!)).toBe(original);
    expect(await loaded.updateProjectModules(first, [])).toBe(true);
    expect(loaded.activeProject?.projectUuid).toBe(first);
    expect(loaded.activeProject?.setUuids).toEqual([]);
    expect(loaded.configSets).toHaveLength(3);
    setActivePinia(createPinia());
    const empty = useConfigStore();
    await empty.initialize();
    expect(await empty.openProject(first)).toBe(true);
    expect(empty.activeProject?.projectUuid).toBe(first);
    expect(await empty.updateProjectModules(first, ['Dem'])).toBe(true);
    expect(empty.activeUuid).toBe(originalId);
  });

  it('rolls back both project membership and configuration data if persistence fails', async () => {
    const store = useConfigStore();
    await store.createProject({ ...input, moduleShortNames: ['Dem'] });
    const before = JSON.stringify(db.data.get(projectsKey));
    const values = store.configSets.map(exportJson),
      active = store.activeUuid;
    db.write.mockImplementation(async (key: string, value: unknown) => {
      if (key === libraryKey) throw new Error('quota exceeded');
      db.data.set(key, JSON.parse(JSON.stringify(value)));
      return value;
    });
    expect(await store.updateProjectModules(store.activeProject!.projectUuid, ['NvM'])).toBe(false);
    expect(JSON.stringify(db.data.get(projectsKey))).toBe(before);
    expect(store.configSets.map(exportJson)).toEqual(values);
    expect(store.activeUuid).toBe(active);
  });

  it('normalizes missing release and legacy preferences only in memory without rewriting old data', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Legacy baseline');
    const raw = db.data.get(libraryKey) as {
      sets: { version?: string }[];
      modulePreferences: Record<string, unknown>;
    };
    delete raw.sets[0].version;
    raw.modulePreferences = { Dem: { included: true, generation: false, validation: true } };
    const bytes = JSON.stringify(raw);
    db.write.mockClear();
    setActivePinia(createPinia());
    const loaded = useConfigStore();
    await loaded.initialize();
    expect(loaded.config?.version).toBe('4.4.0');
    expect(loaded.getModulePreference('Dem', '4.4.0').generation).toBe(false);
    expect(loaded.getModulePreference('Dem', '4.2.2').generation).toBe(true);
    expect(db.write).not.toHaveBeenCalled();
    expect(JSON.stringify(db.data.get(libraryKey))).toBe(bytes);
  });

  it('shows all 84/98 names, disabled reasons and deduplicated transfers through the shared selector', async () => {
    const store = useConfigStore();
    await store.initialize();
    const wrapper = mount(ModuleManager, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    });
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.findComponent(ModuleSelector).exists()).toBe(true);
    expect(wrapper.findAll('.module-option').length + wrapper.findAll('tbody tr').length).toBe(98);
    await wrapper.get('[aria-label="模块目录版本"]').setValue('4.2.2');
    expect(wrapper.findAll('.module-option')).toHaveLength(84);
    expect(wrapper.get('[aria-label="选择 Dcm"]').attributes('disabled')).toBeDefined();
    expect(
      wrapper
        .findAll('.module-option')
        .find((w) => w.text().includes('Dcm'))!
        .attributes('title')
    ).toContain('ADD-INFO');
    await wrapper.get('[aria-label="搜索可用模块"]').setValue('dem');
    expect(wrapper.findAll('.module-option')).toHaveLength(1);
    await wrapper.get('[aria-label="选择 Dem"]').setValue(true);
    await wrapper.get('[aria-label="加入模块"]').trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.get('tbody tr').text()).toContain('4.2.2');
    await wrapper.get('[aria-label="加入模块"]').trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(db.write).not.toHaveBeenCalled();
  });

  it('cancels membership confirmation without writes and applies the same selection after confirmation', async () => {
    const store = useConfigStore();
    await store.createProject({ ...input, moduleShortNames: ['Dem'] });
    const wrapper = mount(ModuleManager, {
      props: { modelValue: true },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    });
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('[aria-label="选择模块 Dem"]').setValue(true);
    await wrapper.get('[aria-label="移除模块"]').trigger('click');
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
    const button = wrapper.findAll('button').find((w) => w.text() === '确定')!;
    const bytes = JSON.stringify([...db.data]);
    db.write.mockClear();
    await button.trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(db.write).not.toHaveBeenCalled();
    expect(JSON.stringify([...db.data])).toBe(bytes);
    expect(store.activeProject?.moduleShortNames).toEqual(['Dem']);
    // Element Plus intersects the prompt and confirm result types; this overload resolves Action.
    confirm.mockImplementation(
      () => Promise.resolve('confirm') as ReturnType<typeof ElMessageBox.confirm>
    );
    await button.trigger('click');
    await flushPromises();
    expect(store.activeProject?.moduleShortNames).toEqual([]);
    expect(store.configSets).toHaveLength(1);
  });
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

  it.skip(/* 用户 2026-11-10 裁定取消「游离配置集」：该用例测旧语义，待重写 */'keeps old configurations in a virtual default project with zero load writes; removing grouping never deletes sets', async () => {
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
    expect(store.projectWarnings[0]).toContain('1 个模块配置暂不可用');
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
    await expect(store.createProject({ ...input, autosarVersion: '4.5.0' })).rejects.toThrow(
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
  it('shows distinct start panels and opens a newly created project after its asynchronous save', async () => {
    const store = useConfigStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/configurator', component: ConfiguratorStartView },
        { path: '/workspace', component: { template: '<h1>编辑工作区</h1>' } },
      ],
    });
    await router.push('/configurator');
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      { attachTo: document.body, global: { plugins: [router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    const selectPanel = async (name: string) => {
      await wrapper
        .findAll('aside button')
        .find((b) => b.text() === name)!
        .trigger('click');
      expect(wrapper.findAll('aside [aria-current="page"]')).toHaveLength(1);
      expect(wrapper.get('h1').text()).toBe(name);
    };
    await selectPanel('打开工程');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('尚无本机工程');
    await selectPanel('导入工程');
    expect(wrapper.find('.recent-projects').exists()).toBe(false);
    await selectPanel('新建工程');
    await wrapper.get('[aria-label="工程名称"]').setValue('新建后打开');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.find('.catalog-hint').exists()).toBe(false);
    expect(wrapper.find('.module-reason').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/workspace');
    expect(store.activeProject?.name).toBe('新建后打开');
    expect(db.data.get(projectsKey)).toBeTruthy();
  });

  it('reports a workspace resource failure and allows retry without losing an existing project', async () => {
    const store = useConfigStore();
    await store.createProject({ ...input, moduleShortNames: ['Dem'] });
    const saved = exportJson(store.config!);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/configurator', component: ConfiguratorStartView },
        { path: '/workspace', component: { template: '<h1>编辑工作区</h1>' } },
      ],
    });
    let fail = true;
    router.beforeEach((to) => {
      if (to.path === '/workspace' && fail)
        throw new Error('Failed to fetch dynamically imported module: WorkspaceView');
    });
    router.onError(() => undefined);
    await router.push('/configurator');
    await router.isReady();
    const wrapper = mount(
      { template: '<router-view />' },
      { global: { plugins: [router, ElementPlus] } }
    );
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper
      .findAll('aside button')
      .find((b) => b.text() === '打开工程')!
      .trigger('click');
    await wrapper.get('.recent-row').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/configurator');
    expect(wrapper.get('[role="alert"]').text()).toContain('配置页面加载失败');
    expect(wrapper.get('.recent-row').attributes('disabled')).toBeUndefined();
    expect(exportJson(store.config!)).toBe(saved);
    fail = false;
    await wrapper.get('.recent-row').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/workspace');
    expect(exportJson(store.config!)).toBe(saved);
  });

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
    expect(wrapper.get('h1').text()).toBe('新建工程');
    expect(wrapper.findAll('aside [aria-current="page"]')).toHaveLength(1);
    expect(wrapper.find('.recent-projects').exists()).toBe(false);
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
    expect(dialog().querySelector('option[value="4.2.2"]')?.hasAttribute('disabled')).toBe(false);
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
    (dialog().querySelector('[aria-label="加入模块"]') as HTMLButtonElement).click();
    await flushPromises();
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
