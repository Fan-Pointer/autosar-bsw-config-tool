import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus from 'element-plus';
import HomeView from '../src/views/HomeView.vue';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import RecoveryPanel from '../src/ui/ConfigSets/RecoveryPanel.vue';
import { useConfigStore } from '../src/stores/configStore';

// Real route + views + store + definitions. Only the disk boundary is replaced.
const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), read: vi.fn(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: db.read,
      setItem: db.write,
    }),
  },
}));
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  db.data.clear();
  db.read.mockReset().mockImplementation(async (key: string) => db.data.get(key) ?? null);
  db.write.mockReset().mockImplementation(async (key: string, value: unknown) => {
    db.data.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  window.sessionStorage.clear();
  setActivePinia(createPinia());
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('project navigation end to end', () => {
  it('waits for the same pending index restore before opening a requested project', async () => {
    const seed = useConfigStore();
    for (const name of ['DEMO1', 'DEMO2'])
      expect(
        await seed.createProject({
          name,
          autosarVersion: '4.4.0',
          chip: { family: 'S32K1XX' },
          moduleShortNames: ['Dem'],
        })
      ).toBe(true);
    const [first, second] = seed.projects;
    await seed.openProject(first!.projectUuid);
    setActivePinia(createPinia());
    const store = useConfigStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let indexReads = 0;
    db.read.mockImplementation(async (key: string) => {
      if (key === 'autosar-projects') {
        indexReads++;
        await gate;
      }
      return db.data.get(key) ?? null;
    });
    const initialization = store.initialize();
    await vi.waitFor(() => expect(indexReads).toBe(1));
    const duplicateInitialization = store.initialize();
    let openSettled = false;
    const opening = store.openProject(second!.projectUuid).then((result) => {
      openSettled = true;
      return result;
    });
    await flushPromises();
    expect(indexReads).toBe(1);
    expect(openSettled).toBe(false);
    release();
    expect(await initialization).toBe(true);
    expect(await duplicateInitialization).toBe(true);
    expect(await opening).toBe(true);
    expect(store.activeProject?.name).toBe('DEMO2');
    expect(store.activeUuid).toBe(second!.setUuids[0]);
  });

  it('retains the original project and selection on missing project or failed persistence', async () => {
    const store = useConfigStore();
    for (const name of ['DEMO1', 'DEMO2'])
      await store.createProject({
        name,
        autosarVersion: '4.4.0',
        chip: { family: 'S32K1XX' },
        moduleShortNames: ['Dem'],
      });
    const before = {
      project: store.activeProject?.projectUuid,
      active: store.activeUuid,
      container: store.selectedEntry?.container.uuid,
    };
    expect(await store.openProject('missing-project')).toBe(false);
    db.write.mockRejectedValue(new Error('disk full'));
    expect(await store.openProject(store.projects[0]!.projectUuid)).toBe(false);
    expect({
      project: store.activeProject?.projectUuid,
      active: store.activeUuid,
      container: store.selectedEntry?.container.uuid,
    }).toEqual(before);
    expect(store.projectBusy).toBe(false);
  });

  it('reports persisted shared and orphan records without silently assigning or overwriting them', async () => {
    const seed = useConfigStore();
    for (const name of ['DEMO1', 'DEMO2', 'ZZ_调研测试_DEL'])
      await seed.createProject({
        name,
        autosarVersion: '4.4.0',
        chip: { family: 'S32K1XX' },
        moduleShortNames: ['Dem'],
      });
    const index = JSON.parse(JSON.stringify(db.data.get('autosar-projects'))) as {
      projects: { setUuids: string[] }[];
    };
    index.projects[1]!.setUuids.push(index.projects[0]!.setUuids[0]!);
    const orphan = index.projects[2]!.setUuids.pop()!;
    db.data.set('autosar-projects', index);
    const before = JSON.stringify([...db.data]);
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useConfigStore();
    db.write.mockClear();
    await store.initialize();
    expect(store.unassignedSets).toEqual([]);
    expect(store.ownershipDiagnosis.shared[0]!.projects).toEqual(['DEMO1', 'DEMO2']);
    expect(store.ownershipDiagnosis.orphan.map((item) => item.uuid)).toEqual([orphan]);
    expect(store.projectScope()).toBeUndefined();
    expect(store.config).toBeNull();
    expect(await store.switchConfigSet(index.projects[0]!.setUuids[0]!)).toBe(false);
    wrapper = mount(RecoveryPanel, { global: { plugins: [pinia, ElementPlus] } });
    expect(wrapper.get('[aria-label="工程归属诊断"]').text()).toContain('共享 1 项 · 未归属 1 项');
    expect(wrapper.text()).toContain('拆分独立副本');
    const blob = await store.exportRawLibrary();
    const backupText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    const backup = JSON.parse(backupText);
    expect(backup.projectIndex).toEqual(index);
    expect(JSON.parse(backup.rawJson)).toEqual(db.data.get('autosar-config-sets-v3'));
    expect(backup.ownershipDiagnosis).toEqual(store.ownershipDiagnosis);
    expect(db.write).not.toHaveBeenCalled();
    expect(JSON.stringify([...db.data])).toBe(before);
  });

  it('opens each requested project despite persisted DEMO1 activeUuid and a global DEMO1 scene', async () => {
    const seed = useConfigStore();
    const inputs = [
      { name: 'DEMO1', moduleShortNames: ['Dem'] },
      { name: 'DEMO2', moduleShortNames: ['CanIf', 'NvM'] },
      { name: 'ZZ_调研测试_DEL', moduleShortNames: ['EcuC'] },
    ];
    for (const input of inputs) {
      expect(
        await seed.createProject({ ...input, autosarVersion: '4.4.0', chip: { family: 'S32K1XX' } })
      ).toBe(true);
    }
    const first = seed.projects[0]!;
    expect(await seed.openProject(first.projectUuid)).toBe(true);
    const staleUuid = seed.activeUuid!;
    window.sessionStorage.setItem(
      'onesar-workspace-scene-v1',
      JSON.stringify({
        opened: [staleUuid],
        activeUuid: staleUuid,
        containerUuid: seed.config!.containers[0]!.uuid,
      })
    );
    expect((db.data.get('autosar-config-sets-v3') as { activeUuid: string }).activeUuid).toBe(
      staleUuid
    );

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useConfigStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: HomeView },
        { path: '/workspace', component: WorkspaceView },
        { path: '/knowledge', component: { template: '<div />' } },
        { path: '/subscription', component: { template: '<div />' } },
      ],
    });
    await router.push('/');
    await router.isReady();
    wrapper = mount(
      { template: '<router-view />' },
      { global: { plugins: [pinia, router, ElementPlus] } }
    );
    await flushPromises();
    expect(store.activeUuid).toBe(staleUuid);

    let demo2Visited = false;
    for (const input of [inputs[1]!, inputs[2]!, inputs[0]!, inputs[1]!]) {
      if (router.currentRoute.value.path !== '/') {
        await router.push('/');
        await flushPromises();
      }
      const row = wrapper
        .findAll('.project-row')
        .find((item) => item.find('strong').text() === input.name)!;
      await row.find('button.row-open').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/workspace');
      expect(wrapper.find('.project-strip strong').text()).toBe(input.name);
      expect(wrapper.findAll('.module-node').map((node) => node.text().replace(/^M/, ''))).toEqual(
        input.moduleShortNames
      );
      expect(store.activeProject!.setUuids).toContain(store.activeUuid);
      expect(store.config!.moduleRef).toBe(
        input.name === 'DEMO2' && demo2Visited ? 'NvM' : input.moduleShortNames[0]
      );
      if (input.name !== 'DEMO1') {
        for (const tab of wrapper.findAll('.module-tab')) expect(tab.text()).not.toContain('DEMO1');
      }
      if (input.name === 'DEMO2') {
        await wrapper
          .findAll('.module-node')
          .find((node) => node.text() === 'MNvM')!
          .trigger('click');
        await flushPromises();
        expect(store.config!.moduleRef).toBe('NvM');
        demo2Visited = true;
      }
    }
  });
});
