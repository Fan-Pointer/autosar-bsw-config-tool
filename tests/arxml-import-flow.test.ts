import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { existsSync, readFileSync } from 'node:fs';
import { useConfigStore } from '../src/stores/configStore';

const db = vi.hoisted(() => ({ data: new Map<string, unknown>(), write: vi.fn() }));
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => db.data.get(key) ?? null,
      setItem: db.write,
    }),
  },
}));
const CANIF = 'D:/TencentApp/GoogleDownLoad/CanIf.arxml';
const PROJECT = 'D:/TencentApp/GoogleDownLoad/ZZ_调研测试_DEL.arxml';
const skip = !existsSync(CANIF);
const skipProject = !existsSync(PROJECT);
beforeEach(() => {
  db.data.clear();
  db.write.mockReset();
  db.write.mockImplementation(async (key: string, value: unknown) => {
    db.data.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('G45 single-module ARXML import with definition auto-load', () => {
  it.skipIf(skip)('loads a missing definition, imports the config and joins the project', async () => {
    const store = useConfigStore();
    await store.initialize();
    expect(
      await store.createProject({
        name: '导入验证',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      })
    ).toBe(true);
    expect(store.modules.some((item) => item.shortName === 'CanIf')).toBe(false);

    const text = readFileSync(CANIF, 'utf8');
    const scanned = store.scanArxmlImport(text);
    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toMatchObject({ shortName: 'CanIf', loaded: false, versionMismatch: false });

    const notes = await store.importArxmlModules(text, [{ shortName: 'CanIf', mode: 'overwrite' }]);

    expect(notes.join(" | ")).toContain("已作为新配置集导入");
    // 定义已按文件版本自动加载
    expect(store.modules.some((item) => item.shortName === 'CanIf' && item.version === '4.4.0')).toBe(true);
    // 配置集已生成并成为当前配置集
    const imported = store.configSets.find((set) => set.moduleRef === 'CanIf');
    expect(imported).toBeTruthy();
    expect(store.activeUuid).toBe(imported!.uuid);
    // 引用型空壳导入后必须补出默认骨架，否则用户无法配置。
    expect(imported!.containers.length).toBeGreaterThan(0);
    // 自动并入工程
    expect(store.activeProject!.moduleShortNames).toContain('CanIf');
    expect(store.activeProject!.setUuids).toContain(imported!.uuid);
    expect(notes.join('')).toContain('CanIf');
  });

  it.skipIf(skipProject)(
    'imports several modules from a project file without one bad module killing the batch',
    async () => {
      const store = useConfigStore();
      await store.initialize();
      await store.createProject({
        name: '工程级导入',
        autosarVersion: '4.4.0',
        chip: { family: 'S32K3XX' },
        moduleShortNames: ['Dem'],
      });
      const text = readFileSync(PROJECT, 'utf8');
      const scanned = store.scanArxmlImport(text);
      expect(scanned.length).toBeGreaterThan(1);
      const notes = await store.importArxmlModules(
        text,
        scanned.map((item) => ({ shortName: item.shortName, mode: 'overwrite' as const }))
      );
      // Dcm 的内置定义仍是旧抽取结果（当时因 ADD-INFO 类型失败被标 unsupported），
      // 逐模块容错后只跳过它，其余模块照常导入。
      expect(notes.join(' | ')).toContain('Dcm：定义加载失败');
      // 多个模块都成功落库（含原本缺定义的模块）。
      const imported = store.configSets.filter((set) =>
        scanned.some((item) => item.shortName === set.moduleRef)
      );
      expect(imported.length).toBeGreaterThan(1);
    }
  );

  it.skipIf(skipProject)('creates a new project without touching the existing one', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.createProject({
      name: 'DEMO',
      autosarVersion: '4.4.0',
      chip: { family: 'S32K3XX' },
      moduleShortNames: ['Dem'],
    });
    const text = readFileSync(PROJECT, 'utf8');
    // 新建工程：扫描不得显示「已有配置」，也不得判版本冲突。
    const preview = store.scanArxmlImport(text, null, true);
    expect(preview.every((item) => item.existingSetUuid === undefined)).toBe(true);
    expect(preview.every((item) => item.versionMismatch === false)).toBe(true);
    const demBefore = store.configSets.find((set) => set.moduleRef === 'Dem')!.uuid;
    await store.importArxmlModules(
      text,
      [{ shortName: 'Dem', mode: 'overwrite' }],
      { newProjectName: 'AAA' }
    );
    // 新工程已建立且成为当前工程
    expect(store.projects.map((item) => item.name)).toContain('AAA');
    expect(store.activeProject?.name).toBe('AAA');
    // 原工程 DEMO 的配置未被覆盖/删除
    expect(store.configSets.some((set) => set.uuid === demBefore)).toBe(true);
    expect(store.projects.find((item) => item.name === 'DEMO')!.setUuids).toContain(demBefore);
  });

  it.skipIf(skipProject)('keeps a freshly imported project intact after reload', async () => {
    const store = useConfigStore();
    await store.initialize();
    await store.importArxmlModules(
      readFileSync(PROJECT, 'utf8'),
      [{ shortName: 'Dem', mode: 'overwrite' }],
      { newProjectName: 'AAA' }
    );
    // 重新初始化 = 从存储重载，模拟用户刷新页面
    setActivePinia(createPinia());
    const reloaded = useConfigStore();
    await reloaded.initialize();
    const project = reloaded.projects.find((item) => item.name === 'AAA');
    expect(project).toBeTruthy();
    const missing = project!.setUuids.filter(
      (uuid) => !reloaded.configSets.some((set) => set.uuid === uuid)
    );
    expect(missing).toEqual([]);
    // 重载后工程能真正打开（此前配置集库为空导致「暂不可用」）
    expect(reloaded.configSets.length).toBeGreaterThan(0);
  });
});
