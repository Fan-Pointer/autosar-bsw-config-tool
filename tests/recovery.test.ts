import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BswmdLoader } from '../src/core/bswmd/BswmdLoader';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import type { ConfigContainer, ConfigInstance } from '../src/core/config/ConfigTypes';
import { useConfigStore } from '../src/stores/configStore';
import oldDefinition from '../bswmd/legacy/dem_bswmd_4.2.2.json';
import officialDefinition from '../bswmd/dem_bswmd.json';

const LIBRARY = 'autosar-config-sets-v3',
  RECOVERY = 'autosar-recovery-state',
  DRAFT = 'autosar-config-sets-v4-draft';
const local = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));
vi.mock('localforage', () => ({ default: { createInstance: () => local } }));
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
beforeEach(() => {
  vi.resetAllMocks();
  local.saved.clear();
  setActivePinia(createPinia());
  local.getItem.mockImplementation(async (key: string) => copy(local.saved.get(key) ?? null));
  local.setItem.mockImplementation(async (key: string, value: unknown) => {
    local.saved.set(key, copy(value));
    return value;
  });
  local.removeItem.mockImplementation(async (key: string) => {
    local.saved.delete(key);
  });
});
function stored(config: ConfigInstance) {
  const visit = (container: ConfigContainer): unknown => ({
    ...container,
    parameters: [...container.parameters],
    references: [...container.references],
    subContainers: container.subContainers.map(visit),
  });
  return copy({ ...config, containers: config.containers.map(visit) });
}
function fixture(legacy = false, name = legacy ? '历史诊断配置' : '当前配置') {
  const module = new BswmdLoader().loadFromString(
    JSON.stringify(legacy ? oldDefinition : officialDefinition)
  );
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  config.name = name;
  if (legacy) {
    const root = config.containers[0];
    const dtcDef = module.containers[0].subContainers.find((d) => d.shortName === 'DemDTC')!;
    const attrDef = module.containers[0].subContainers.find(
      (d) => d.shortName === 'DemDTCAttributes'
    )!;
    const dtc = manager.addContainerInstance(config, root.uuid, dtcDef.uuid);
    const attr = manager.addContainerInstance(config, root.uuid, attrDef.uuid);
    const node = dtcDef.parameters.find((p) => p.shortName === 'DemJ1939DTC_J1939NodeRef')!;
    const immediate = attrDef.parameters.find((p) => p.shortName === 'DemImmediateNvStorage')!;
    manager.setParameterValue(dtc, node.uuid, 'J1939_NODE_KEEP');
    manager.setParameterValue(attr, immediate.uuid, true);
  }
  return { config, module, saved: stored(config) };
}
async function mixed() {
  const current = fixture(),
    legacy = fixture(true);
  const raw = {
    sets: [current.saved, legacy.saved],
    activeUuid: current.config.uuid,
    unknownExtension: { retained: 42 },
  };
  local.saved.set(LIBRARY, copy(raw));
  const store = useConfigStore();
  await store.initialize();
  return { store, raw, current, legacy };
}
async function blobJson(blob: Blob): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(JSON.parse(String(reader.result)));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('safe library recovery', () => {
  it('isolates one old set without rewriting it or losing the compatible set', async () => {
    const { store, raw, current, legacy } = await mixed();
    expect(store.configSets.map((s) => s.uuid)).toEqual([current.config.uuid]);
    expect(store.quarantinedSets).toHaveLength(1);
    expect(store.quarantinedSets[0].raw).toEqual(legacy.saved);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
    expect(local.setItem.mock.calls.some(([key]) => key === LIBRARY)).toBe(false);
    expect(store.dataSafety.locked).toBe(true);
  });
  it('writes the permanent snapshot before the lock sidecar and reuses it after refresh', async () => {
    const { store, raw } = await mixed();
    const key = store.dataSafety.snapshotKey!;
    expect(local.saved.get(key)).toEqual(raw);
    expect(local.setItem.mock.calls.map(([k]) => k)).toEqual([key, RECOVERY]);
    const quarantine = copy(store.quarantinedSets);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    expect(restored.dataSafety.snapshotKey).toBe(key);
    expect(restored.quarantinedSets).toEqual(quarantine);
    expect(
      [...local.saved.keys()].filter((k) => k.startsWith('autosar-recovery-snapshot-'))
    ).toEqual([key]);
  });
  it('rejects every original write before mutation, including import, delete and definition registration', async () => {
    const { store, raw } = await mixed();
    const before = store.exportConfig('json');
    const session = store.prepareImport(before, 'json');
    expect(() => store.assertWritable()).toThrow('DATA_LOCKED');
    await expect(store.saveConfig()).rejects.toThrow('DATA_LOCKED');
    await expect(store.applyImport(session, 'overwrite')).rejects.toThrow('DATA_LOCKED');
    await expect(store.deleteConfigSet(store.activeUuid!)).rejects.toThrow('DATA_LOCKED');
    await expect(store.cloneConfigSet(store.activeUuid!)).rejects.toThrow('DATA_LOCKED');
    await expect(store.importModuleDefinitions([])).rejects.toThrow('DATA_LOCKED');
    expect(store.exportConfig('json')).toBe(before);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
  });
  it('locks even when snapshot and sidecar writes both fail', async () => {
    const legacy = fixture(true);
    const raw = { sets: [legacy.saved] };
    local.saved.set(LIBRARY, raw);
    local.setItem.mockRejectedValue(new Error('quota exceeded'));
    const store = useConfigStore();
    await store.initialize();
    expect(store.dataSafety).toMatchObject({ locked: true, snapshotKey: null });
    expect(store.recoveryWarning).toContain('quota');
    await expect(store.saveConfig()).rejects.toThrow('DATA_LOCKED');
    expect(local.saved.get(LIBRARY)).toEqual(raw);
    expect(JSON.parse(String((await blobJson(await store.exportRawLibrary())).rawJson))).toEqual(
      raw
    );
  });
  it('exports raw data separately from recovery metadata without normalizing original fields', async () => {
    const { store, raw } = await mixed();
    const pack = await blobJson(await store.exportRawLibrary());
    expect(pack.kind).toBe('autosar-bsw-raw-export');
    expect(pack.sourceKey).toBe(LIBRARY);
    expect(JSON.parse(String(pack.rawJson))).toEqual(raw);
    expect(pack.snapshotKeys).toEqual([store.dataSafety.snapshotKey]);
    expect(pack.backupIndex).toEqual([]);
  });
  it('opens exact historical values without registering an editable old module or mutating records', async () => {
    const { store, raw } = await mixed();
    const view = await store.openQuarantinedReadOnly(0);
    expect(view.config.version).toBe('4.2.2');
    const entries = collectContainers(view.config, view.module);
    const dtc = entries.find((e) => e.definition.shortName === 'DemDTC')!;
    const attr = entries.find((e) => e.definition.shortName === 'DemDTCAttributes')!;
    const node = dtc.definition.parameters.find((p) => p.shortName === 'DemJ1939DTC_J1939NodeRef')!;
    const immediate = attr.definition.parameters.find(
      (p) => p.shortName === 'DemImmediateNvStorage'
    )!;
    expect(dtc.container.parameters.get(node.uuid)?.value).toBe('J1939_NODE_KEEP');
    expect(attr.container.parameters.get(immediate.uuid)?.value).toBe(true);
    dtc.container.parameters.get(node.uuid)!.value = 'DETACHED_VIEW';
    expect(local.saved.get(LIBRARY)).toEqual(raw);
    expect(store.modules.map((m) => m.version)).toEqual(['4.4.0']);
    expect(store.quarantinedSets[0].raw).toEqual(raw.sets[1]);
  });
  it('persists and restores new draft sets separately, including their subsequent edits', async () => {
    const { store, raw } = await mixed();
    expect(await store.createConfigSet('独立草稿')).toBe(true);
    const id = store.activeUuid!;
    store.renameContainer('DraftRoot');
    expect(await store.saveConfig()).toBe(true);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
    expect((local.saved.get(DRAFT) as { sets: unknown[] }).sets).toHaveLength(1);
    setActivePinia(createPinia());
    const reloaded = useConfigStore();
    await reloaded.initialize();
    expect(reloaded.dataSafety.locked).toBe(true);
    expect(reloaded.draftUuids).toEqual([id]);
    expect(reloaded.configSets.find((s) => s.uuid === id)?.containers[0].shortName).toBe(
      'DraftRoot'
    );
    expect(await reloaded.switchConfigSet(id)).toBe(true);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
  });
  it('leaves a compatible library untouched on load and preserves additional fields on save', async () => {
    const current = fixture();
    const raw = { sets: [current.saved], extra: { vendorNote: 'keep' } };
    local.saved.set(LIBRARY, raw);
    const store = useConfigStore();
    await store.initialize();
    expect(local.setItem).not.toHaveBeenCalled();
    expect(store.dataSafety.locked).toBe(false);
    expect(await store.saveConfig()).toBe(true);
    expect(local.saved.get(LIBRARY)).toMatchObject({ extra: raw.extra, schemaVersion: 4 });
    expect([...local.saved.keys()].some((k) => k.startsWith('autosar-recovery'))).toBe(false);
  });
  it('isolates malformed definitions, preferences and duplicate set identities without discarding other records', async () => {
    const current = fixture(),
      duplicate = fixture();
    duplicate.saved.uuid = current.saved.uuid;
    const raw = {
      sets: [current.saved, duplicate.saved],
      importedModules: [{ nonsense: true }],
      modulePreferences: {
        Dem: { included: true, generation: false, validation: true },
        Bad: { included: 'yes' },
      },
    };
    local.saved.set(LIBRARY, raw);
    const store = useConfigStore();
    await store.initialize();
    expect(store.configSets).toHaveLength(1);
    expect(store.quarantinedSets.map((q) => q.kind).sort()).toEqual([
      'configuration',
      'module',
      'preference',
    ]);
    expect(store.getModulePreference('Dem').generation).toBe(false);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
  });
  it('preserves malformed whole libraries and never overwrites an unreadable storage source', async () => {
    local.saved.set(LIBRARY, { sets: 'corrupt', anything: 'retain' });
    const store = useConfigStore();
    await store.initialize();
    expect(store.quarantinedSets[0].kind).toBe('library');
    await expect(store.saveConfig()).rejects.toThrow('DATA_LOCKED');
    expect(local.saved.get(LIBRARY)).toEqual({ sets: 'corrupt', anything: 'retain' });
  });
  it('protects a legacy v2-only source and identifies the correct raw export key', async () => {
    const old = fixture(true);
    local.saved.set('autosar-config-v2', old.saved);
    const store = useConfigStore();
    await store.initialize();
    expect((await blobJson(await store.exportRawLibrary())).sourceKey).toBe('autosar-config-v2');
    expect(local.saved.has(LIBRARY)).toBe(false);
    expect(local.saved.get(store.dataSafety.snapshotKey!)).toEqual(old.saved);
  });
  it('refuses stale-tab and direct-create writes when existing storage was not safely loaded', async () => {
    const raw = { sets: [fixture(true).saved] };
    local.saved.set(LIBRARY, raw);
    const store = useConfigStore();
    store.createConfig();
    expect(await store.saveConfig()).toBe(false);
    expect(store.dataSafety.locked).toBe(true);
    expect(local.saved.get(LIBRARY)).toEqual(raw);
  });
  it('never rotates or removes a recovery snapshot during repeated draft saves', async () => {
    const { store, raw } = await mixed();
    const key = store.dataSafety.snapshotKey!;
    for (let i = 0; i < 5; i++) expect(await store.createConfigSet(`草稿${i}`)).toBe(true);
    expect(local.saved.get(key)).toEqual(raw);
    expect(local.removeItem).not.toHaveBeenCalled();
    await expect(store.deleteRecoverySnapshot(LIBRARY)).rejects.toThrow('快照已改变');
  });
  it('blocks concurrent writes while the recovery snapshot is still pending', async () => {
    const raw = { sets: [fixture(true).saved] };
    local.saved.set(LIBRARY, raw);
    let release: (() => void) | undefined;
    local.setItem.mockImplementation(async (key: string, value: unknown) => {
      if (key.startsWith('autosar-recovery-snapshot-'))
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      local.saved.set(key, copy(value));
      return value;
    });
    const store = useConfigStore();
    const loading = store.initialize();
    await vi.waitFor(() => expect(release).toBeDefined());
    await expect(store.saveConfig()).rejects.toThrow('DATA_LOCKED');
    release!();
    await loading;
    expect(local.saved.get(LIBRARY)).toEqual(raw);
    expect(store.dataSafety.locked).toBe(true);
  });
  it('rechecks the write lock after initialization before importing definitions', async () => {
    local.saved.set(LIBRARY, { sets: [fixture(true).saved] });
    const store = useConfigStore();
    const extra = { ...fixture().module, shortName: 'Synthetic' };
    await expect(store.importModuleDefinitions([extra])).rejects.toThrow('DATA_LOCKED');
    expect(store.modules.map((m) => m.shortName)).toEqual(['Dem']);
  });
});
