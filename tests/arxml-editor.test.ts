import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConfigStore } from '../src/stores/configStore';

const saved = vi.hoisted(() => new Map<string, unknown>());
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: async (key: string) => saved.get(key),
      setItem: async (key: string, value: unknown) => {
        saved.set(key, JSON.parse(JSON.stringify(value)));
        return value;
      },
    }),
  },
}));
beforeEach(() => {
  saved.clear();
  setActivePinia(createPinia());
});

describe('explicit configuration flags in editor history and storage', () => {
  it('confirms an unchanged suggestion, changes export semantics, and undoes/redoes/persists that choice', async () => {
    const store = useConfigStore();
    await store.createConfigSet('Confirmed defaults');
    const root = store.config!.containers[0];
    store.selectContainer(root.uuid);
    const field = store.selectedEntry!.definition.parameters[0];
    const suggested = root.parameters.get(field.uuid)!.value;
    expect(store.exportConfig('arxml')).not.toContain('<VALUE>');
    store.setParameterValue(field.uuid, suggested);
    expect(store.selectedEntry!.container.parameters.get(field.uuid)?.isConfigured).toBe(true);
    expect(store.exportConfig('arxml')).toContain(`<VALUE>${suggested}</VALUE>`);
    store.undo();
    expect(store.exportConfig('arxml')).not.toContain('<VALUE>');
    store.redo();
    expect(await store.saveConfig()).toBe(true);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    expect(restored.config!.containers[0].parameters.get(field.uuid)).toEqual(
      store.config!.containers[0].parameters.get(field.uuid)
    );
    expect(restored.exportConfig('arxml')).toContain(`<VALUE>${suggested}</VALUE>`);
  });
  it('records reference selection and clearing flags in one-step undo/redo', () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0];
    const dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    const attributes = store.addContainerInstance('fixture-dem-dtc-attributes-def')!;
    store.selectContainer(dtc.uuid);
    const id = 'fixture-dem-dtc-attributes-ref';
    store.setReferenceTarget(id, attributes.uuid);
    expect(store.selectedEntry!.container.references.get(id)?.isConfigured).toBe(true);
    store.setReferenceTarget(id, '');
    expect(store.selectedEntry!.container.references.get(id)?.isConfigured).toBe(false);
    store.undo();
    expect(store.selectedEntry!.container.references.get(id)).toMatchObject({
      targetUuid: attributes.uuid,
      isConfigured: true,
    });
    store.redo();
    expect(store.selectedEntry!.container.references.get(id)).toMatchObject({
      targetUuid: '',
      isConfigured: false,
    });
  });
  it('restores pre-flag local storage by inferring only selected targets, without changing UUIDs', async () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.config!.containers[0],
      dtc = store.addContainerInstance('fixture-dem-dtc-def')!;
    store.selectContainer(root.uuid);
    const attributes = store.addContainerInstance('fixture-dem-dtc-attributes-def')!;
    store.selectContainer(dtc.uuid);
    store.setReferenceTarget('fixture-dem-dtc-attributes-ref', attributes.uuid);
    await store.saveConfig();
    const stripReferenceFlags = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(stripReferenceFlags);
      const record = value as Record<string, unknown>;
      if ('targetUuid' in record) delete record.isConfigured;
      Object.values(record).forEach(stripReferenceFlags);
    };
    for (const value of saved.values()) stripReferenceFlags(value);
    setActivePinia(createPinia());
    const restored = useConfigStore();
    await restored.initialize();
    restored.selectContainer(dtc.uuid);
    expect(
      restored.selectedEntry!.container.references.get('fixture-dem-dtc-attributes-ref')
    ).toMatchObject({ targetUuid: attributes.uuid, isConfigured: true });
    expect(
      restored.selectedEntry!.container.references.get('fixture-dem-dtc-obd-ref')?.isConfigured
    ).toBe(false);
  });
});

// Only the input definition is replaced. Store, parser, IO, history and UI remain real.
// Official 4.4.0 integration is covered separately by core/ecuc/choice/recovery tests.
vi.mock('../bswmd/dem_bswmd.json?raw', async () => ({
  default: JSON.stringify((await import('./fixtures/synthetic-dem.json')).default),
}));
