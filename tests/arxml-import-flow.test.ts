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
const skip = !existsSync(CANIF);
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

    const notes = await store.importArxmlModules(text, [{ shortName: 'CanIf', mode: 'copy' }]);

    expect(notes.join(" | ")).toContain("已作为新配置集导入");
    // 定义已按文件版本自动加载
    expect(store.modules.some((item) => item.shortName === 'CanIf' && item.version === '4.4.0')).toBe(true);
    // 配置集已生成并成为当前配置集
    const imported = store.configSets.find((set) => set.moduleRef === 'CanIf');
    expect(imported).toBeTruthy();
    expect(store.activeUuid).toBe(imported!.uuid);
    // 该文件是引用型空壳（模块配置在外部文件），容器数可以为 0，但配置集必须存在。
    expect(Array.isArray(imported!.containers)).toBe(true);
    // 自动并入工程
    expect(store.activeProject!.moduleShortNames).toContain('CanIf');
    expect(store.activeProject!.setUuids).toContain(imported!.uuid);
    expect(notes.join('')).toContain('CanIf');
  });
});
