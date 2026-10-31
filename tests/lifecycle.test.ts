import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { cloneConfiguration } from '../src/core/config/ConfigClone';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import { useConfigStore } from '../src/stores/configStore';
import raw from '../bswmd/dem_bswmd.json';

const local = vi.hoisted(() => ({
  saved: new Map<string, unknown>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
}));
vi.mock('localforage', () => ({ default: { createInstance: () => local } }));
beforeEach(() => {
  vi.resetAllMocks();
  local.saved.clear();
  local.getItem.mockImplementation(async (key: string) => local.saved.get(key) ?? null);
  local.setItem.mockImplementation(async (key: string, value: unknown) => {
    local.saved.set(key, JSON.parse(JSON.stringify(value)));
    return value;
  });
  setActivePinia(createPinia());
});

function fixture() {
  const module = new BswmdParser().parseFromJson(JSON.stringify(raw));
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  const root = config.containers[0];
  const dtc = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-def');
  const attributes = manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-attributes-def');
  manager.setReferenceTarget(dtc, 'ecuc-dem-dtc-attributes-ref', attributes.uuid);
  return { module, manager, config, root, dtc, attributes };
}

describe('core cloning and lifecycle availability', () => {
  it('deep-copies a complete set, regenerates every UUID and remaps forward/cyclic references', () => {
    const { module, config, dtc, attributes } = fixture();
    attributes.references.set('test-back', {
      definitionRef: 'test-back',
      targetUuid: dtc.uuid,
      isConfigured: true,
    });
    const copy = cloneConfiguration(config, '副本');
    const originalEntries = collectContainers(config, module);
    const copiedEntries = collectContainers(copy, module);
    expect(copy.uuid).not.toBe(config.uuid);
    expect(copy.name).toBe('副本');
    const originalIds = new Set(originalEntries.map((entry) => entry.container.uuid));
    expect(copiedEntries.every((entry) => !originalIds.has(entry.container.uuid))).toBe(true);
    const [newDtc, newAttributes] = copy.containers[0].subContainers;
    expect(newDtc.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(
      newAttributes.uuid
    );
    expect(newAttributes.references.get('test-back')?.targetUuid).toBe(newDtc.uuid);
    newDtc.parameters.get('ecuc-dem-dtc-value')!.value = 123;
    newDtc.references.get('ecuc-dem-dtc-attributes-ref')!.targetUuid = '';
    expect(dtc.parameters.get('ecuc-dem-dtc-value')?.value).toBe(1);
    expect(dtc.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(attributes.uuid);
    expect(copiedEntries.map((entry) => entry.container.definitionRef)).toEqual(
      originalEntries.map((entry) => entry.container.definitionRef)
    );
  });

  it('clears out-of-subtree targets, preserves source references and creates independent Maps', () => {
    const { manager, config, dtc, attributes } = fixture();
    const clone = manager.cloneContainerInstance(config, dtc.uuid);
    expect(clone.shortName).toBe('DemDTC_2');
    expect(clone.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe('');
    expect(dtc.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(attributes.uuid);
    clone.parameters.get('ecuc-dem-dtc-value')!.value = 5;
    expect(dtc.parameters.get('ecuc-dem-dtc-value')?.value).toBe(1);
    expect(manager.cloneContainerInstance(config, dtc.uuid).shortName).toBe('DemDTC_3');
  });

  it('remaps self and descendant targets when cloning a nested subtree', () => {
    const { module, manager, config, dtc, attributes } = fixture();
    const dtcDefinition = module.containers[0].subContainers[0];
    dtcDefinition.subContainers = [module.containers[0].subContainers[1]];
    const nested = manager.addContainerInstance(config, dtc.uuid, attributes.definitionRef);
    manager.setReferenceTarget(dtc, 'ecuc-dem-dtc-attributes-ref', nested.uuid);
    nested.references.set('self', {
      definitionRef: 'self',
      targetUuid: nested.uuid,
      isConfigured: true,
    });
    const clone = manager.cloneContainerInstance(config, dtc.uuid);
    expect(clone.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(
      clone.subContainers[0].uuid
    );
    expect(clone.subContainers[0].references.get('self')?.targetUuid).toBe(
      clone.subContainers[0].uuid
    );
    expect(manager.findParent(config, clone.subContainers[0].uuid)?.uuid).toBe(clone.uuid);
  });

  it('queries and enforces the same upper/lower limits for add, clone and delete', () => {
    const { manager, config, root } = fixture();
    expect(manager.getAddOptions(config, null)[0].disabledReason).toContain(
      'upper multiplicity 1 reached'
    );
    expect(manager.getRemovalReason(config, root.uuid)).toContain('lower multiplicity 1 required');
    const before = config.containers.length;
    expect(() => manager.cloneContainerInstance(config, root.uuid)).toThrow('upper multiplicity 1');
    expect(() => manager.removeContainerInstance(config, root.uuid)).toThrow(
      'lower multiplicity 1'
    );
    expect(config.containers).toHaveLength(before);
  });

  it('uses only direct definitions and handles zero upper bounds without mutation', () => {
    const { module, manager, config, root, dtc } = fixture();
    module.containers[0].subContainers[0].multiplicity.upper = 0;
    expect(manager.getAddOptions(config, root.uuid)[0].disabledReason).toContain(
      'upper multiplicity 0'
    );
    expect(manager.getAddOptions(config, dtc.uuid)).toEqual([]);
    expect(() => manager.addContainerInstance(config, dtc.uuid, dtc.definitionRef)).toThrow(
      'not allowed'
    );
    expect(() => manager.cloneContainerInstance(config, dtc.uuid)).toThrow('upper multiplicity 0');
  });
});

describe('configuration library and editor actions', () => {
  it('starts empty and creates named sets with unique identities and selected required roots', async () => {
    const store = useConfigStore();
    expect(await store.initialize()).toBe(true);
    expect(store.config).toBeNull();
    expect(await store.createConfigSet('基础配置')).toBe(true);
    const first = store.config!.uuid;
    expect(store.selectedEntry?.container.subContainers).toHaveLength(0);
    expect(store.childOptions[0].definition.initialAddLabel).toBe('添加第一条 DTC');
    expect(await store.createConfigSet('诊断配置')).toBe(true);
    expect(store.configSets).toHaveLength(2);
    expect(store.config!.uuid).not.toBe(first);
    expect(store.config!.name).toBe('诊断配置');
    expect(store.summaries[0]).toMatchObject({
      name: '基础配置',
      containerCount: 1,
      errorCount: 0,
    });
  });

  it('adds three uniquely named DTCs, selects them, falls back to parent on delete and reuses gaps safely', () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0];
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      store.selectContainer(root.uuid);
      ids.push(store.addContainerInstance('ecuc-dem-dtc-def')!.uuid);
    }
    expect(root.subContainers.map((item) => item.shortName)).toEqual([
      'DemDTC',
      'DemDTC_2',
      'DemDTC_3',
    ]);
    expect(new Set(ids).size).toBe(3);
    store.selectContainer(ids[1]);
    store.removeContainerInstance(ids[1]);
    expect(store.selectedEntry?.container.uuid).toBe(root.uuid);
    store.addContainerInstance('ecuc-dem-dtc-def');
    expect(new Set(root.subContainers.map((item) => item.shortName)).size).toBe(3);
  });

  it('persists dirty outgoing edits before switching and restores all sets, Maps and active identity', async () => {
    const store = useConfigStore();
    await store.createConfigSet('A');
    const first = store.config!.uuid;
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('ecuc-dem-dtc-def')!;
    store.setParameterValue('ecuc-dem-dtc-value', 27);
    store.selectContainer(root.uuid);
    const attributes = store.addContainerInstance('ecuc-dem-dtc-attributes-def')!;
    store.selectContainer(dtc.uuid);
    store.setReferenceTarget('ecuc-dem-dtc-attributes-ref', attributes.uuid);
    await store.createConfigSet('B');
    const second = store.config!.uuid;
    await store.switchConfigSet(first);
    store.selectContainer(dtc.uuid);
    store.setParameterValue('ecuc-dem-dtc-value', 42);
    await store.switchConfigSet(second);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    expect(restored.activeUuid).toBe(second);
    expect(restored.configSets).toHaveLength(2);
    await restored.switchConfigSet(first);
    restored.selectContainer(dtc.uuid);
    expect(restored.parameterData['ecuc-dem-dtc-value']).toBe(42);
    expect(restored.referenceData['ecuc-dem-dtc-attributes-ref']).toBe(attributes.uuid);
    expect(restored.selectedEntry?.container.parameters).toBeInstanceOf(Map);
    restored.selectContainer(root.uuid);
    expect(restored.addContainerInstance('ecuc-dem-dtc-def')?.shortName).toBe('DemDTC_2');
  });

  it('does not switch or discard dirty edits when storage rejects the outgoing save', async () => {
    const store = useConfigStore();
    await store.createConfigSet('A');
    const first = store.activeUuid!;
    await store.createConfigSet('B');
    const current = store.activeUuid;
    store.setParameterValue('ecuc-dem-general-max-number-event', 44);
    local.setItem.mockRejectedValueOnce(new Error('quota exceeded'));
    expect(await store.switchConfigSet(first)).toBe(false);
    expect(store.activeUuid).toBe(current);
    expect(store.isDirty).toBe(true);
    expect(store.parameterData['ecuc-dem-general-max-number-event']).toBe(44);
    expect(store.error).toBe('quota exceeded');
  });

  it('clones a set with remapped reference choices and leaves source edits isolated', async () => {
    const store = useConfigStore();
    await store.createConfigSet('A');
    const sourceId = store.activeUuid!;
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('ecuc-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    const attributes = store.addContainerInstance('ecuc-dem-dtc-attributes-def')!;
    store.selectContainer(dtc.uuid);
    store.setReferenceTarget('ecuc-dem-dtc-attributes-ref', attributes.uuid);
    expect(await store.cloneConfigSet(sourceId)).toBe(true);
    const copyDtc = store.config!.containers[0].subContainers[0];
    const copyAttributes = store.config!.containers[0].subContainers[1];
    expect(copyDtc.references.get('ecuc-dem-dtc-attributes-ref')?.targetUuid).toBe(
      copyAttributes.uuid
    );
    store.selectContainer(copyDtc.uuid);
    store.setReferenceTarget('ecuc-dem-dtc-attributes-ref', '');
    await store.switchConfigSet(sourceId);
    store.selectContainer(dtc.uuid);
    expect(store.referenceData['ecuc-dem-dtc-attributes-ref']).toBe(attributes.uuid);
  });

  it('deletes current sets with first-set fallback and persists a truly empty library', async () => {
    const store = useConfigStore();
    await store.createConfigSet('A');
    const first = store.activeUuid!;
    await store.createConfigSet('B');
    await store.deleteConfigSet(store.activeUuid!);
    expect(store.activeUuid).toBe(first);
    await store.deleteConfigSet(first);
    expect(store.config).toBeNull();
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    expect(restored.configSets).toEqual([]);
    expect(restored.config).toBeNull();
  });

  it('restores the deleted set and selection if persistence fails', async () => {
    const store = useConfigStore();
    await store.createConfigSet('A');
    const id = store.activeUuid!;
    const selected = store.selectedKey;
    local.setItem.mockRejectedValueOnce(new Error('write failed'));
    expect(await store.deleteConfigSet(id)).toBe(false);
    expect(store.activeUuid).toBe(id);
    expect(store.selectedKey).toBe(selected);
    expect(store.configSets).toHaveLength(1);
  });

  it('reads the old single-config storage and does not resurrect it after deleting the migrated set', async () => {
    const store = useConfigStore();
    await store.createConfigSet('旧配置');
    const saved = local.saved.get('autosar-config-sets-v3') as { sets: unknown[] };
    local.saved.set('autosar-config-v2', saved.sets[0]);
    local.saved.delete('autosar-config-sets-v3');
    setActivePinia(createPinia());
    const migrated = useConfigStore();
    await migrated.initialize();
    expect(migrated.config?.name).toBe('旧配置');
    await migrated.deleteConfigSet(migrated.activeUuid!);
    setActivePinia(createPinia());
    const empty = useConfigStore();
    await empty.initialize();
    expect(empty.configSets).toHaveLength(0);
  });

  it('does not clear dirty state for edits made while an older snapshot is being saved', async () => {
    const store = useConfigStore();
    store.createConfig();
    let release: (() => void) | undefined;
    local.setItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const saving = store.saveConfig();
    await vi.waitFor(() => expect(release).toBeDefined());
    store.setParameterValue('ecuc-dem-general-max-number-event', 99);
    release!();
    await saving;
    expect(store.isDirty).toBe(true);
    expect(store.parameterData['ecuc-dem-general-max-number-event']).toBe(99);
  });

  it('revalidates both duplicate nodes on edits and removes diagnostics after fixing the value', () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0];
    const first = store.addContainerInstance('ecuc-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    const second = store.addContainerInstance('ecuc-dem-dtc-def')!;
    expect(
      store.violations.filter((item) => item.ruleId === 'DEM-001').map((item) => item.containerUuid)
    ).toEqual([first.uuid, second.uuid]);
    store.setParameterValue('ecuc-dem-dtc-value', 2);
    expect(store.violations.filter((item) => item.ruleId === 'DEM-001')).toEqual([]);
  });
});
