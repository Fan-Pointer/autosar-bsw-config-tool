import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import localforage from 'localforage';
import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import type {
  ConfigContainer,
  ConfigInstance,
  ConfigParameterValue,
  ConfigReferenceValue,
} from '@/core/config/ConfigTypes';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import { BswmdLoader } from '@/core/bswmd/BswmdLoader';
import { ConfigInstanceManager } from '@/core/config/ConfigInstance';
import { collectContainers } from '@/core/config/ConfigTraversal';
import { ConstraintEngine } from '@/core/constraint/ConstraintEngine';
import { DefinitionConstraints } from '@/core/constraint/DefinitionConstraints';
import { DemConstraints } from '@/core/constraint/DemConstraints';

interface StoredContainer extends Omit<
  ConfigContainer,
  'parameters' | 'references' | 'subContainers'
> {
  parameters: [string, ConfigParameterValue][];
  references: [string, ConfigReferenceValue][];
  subContainers: StoredContainer[];
}
interface StoredConfig extends Omit<ConfigInstance, 'containers'> {
  containers: StoredContainer[];
}
const storage = localforage.createInstance({ name: 'AutosarBswConfigTool', storeName: 'config' });
const STORAGE_KEY = 'autosar-config-v2';

function serialize(container: ConfigContainer): StoredContainer {
  return {
    ...container,
    parameters: [...container.parameters].map(([id, parameter]) => [id, { ...parameter }]),
    references: [...container.references].map(([id, reference]) => [id, { ...reference }]),
    subContainers: container.subContainers.map(serialize),
  };
}
function deserialize(container: StoredContainer): ConfigContainer {
  return {
    ...container,
    parameters: new Map(container.parameters),
    references: new Map(container.references),
    subContainers: container.subContainers.map(deserialize),
  };
}

/**
 * Use the definition-driven editor store.
 * @returns Module definitions, current configuration, and editor actions.
 */
export const useConfigStore = defineStore('config', () => {
  const loader = new BswmdLoader();
  // New module files are discovered at build time without extending the engine or UI.
  const sources = import.meta.glob<string>('../../bswmd/*_bswmd.json', {
    eager: true,
    query: '?raw',
    import: 'default',
  });
  for (const source of Object.values(sources)) loader.loadFromString(source);
  const modules = ref<BswmdModule[]>(loader.getAllModules());
  const manager = new ConfigInstanceManager();
  const engine = new ConstraintEngine();
  engine.registerRules([...DefinitionConstraints, ...DemConstraints]);
  const config = ref<ConfigInstance | null>(null);
  const selectedContainerUuid = ref<string>();
  const selectedFieldUuid = ref<string>();
  const isDirty = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const violations = ref<ConstraintViolation[]>([]);
  const validated = ref(false);
  const module = computed(() =>
    modules.value.find((item) => item.shortName === config.value?.moduleRef)
  );
  const entries = computed(() =>
    config.value && module.value ? collectContainers(config.value, module.value) : []
  );
  const selectedEntry = computed(() =>
    entries.value.find((entry) => entry.container.uuid === selectedContainerUuid.value)
  );
  const selectedKey = computed(() =>
    selectedFieldUuid.value
      ? `${selectedContainerUuid.value}:${selectedFieldUuid.value}`
      : selectedContainerUuid.value
  );
  const parameterData = computed(() =>
    Object.fromEntries(
      [...(selectedEntry.value?.container.parameters ?? [])].map(([id, parameter]) => [
        id,
        parameter.value,
      ])
    )
  );
  const referenceData = computed(() =>
    Object.fromEntries(
      [...(selectedEntry.value?.container.references ?? [])].map(([id, reference]) => [
        id,
        reference.targetUuid,
      ])
    )
  );
  const referenceOptions = computed(() =>
    Object.fromEntries(
      (selectedEntry.value?.definition.references ?? []).map((reference) => [
        reference.uuid,
        entries.value
          .filter((entry) => entry.definition.shortName === reference.destinationContainerType)
          .map((entry) => ({
            uuid: entry.container.uuid,
            label: entry.path,
          })),
      ])
    )
  );

  /** Select an instance and optionally a field.
   * @param uuid Instance UUID.
   * @param fieldUuid Optional parameter/reference UUID.
   * @returns Nothing.
   */
  function selectContainer(uuid: string, fieldUuid?: string): void {
    selectedContainerUuid.value = uuid;
    selectedFieldUuid.value = fieldUuid;
  }

  /** Create the initial editable tree from a discovered module.
   * @param moduleName Module short name; defaults to the first loaded definition.
   * @returns Nothing.
   */
  function createConfig(moduleName = modules.value[0]?.shortName): void {
    const definition = modules.value.find((item) => item.shortName === moduleName);
    if (!definition) throw new Error('No BSWMD module is available');
    config.value = manager.createFromBswmd(definition);
    selectedContainerUuid.value = config.value.containers[0]?.uuid;
    selectedFieldUuid.value = undefined;
    isDirty.value = true;
    validated.value = false;
    violations.value = [];
    error.value = null;
  }

  /** Validate the active configuration.
   * @returns The current violations.
   */
  function validate(): ConstraintViolation[] {
    violations.value =
      config.value && module.value ? engine.validate(config.value, module.value) : [];
    validated.value = Boolean(config.value && module.value);
    return violations.value;
  }

  function changed(): void {
    if (config.value) manager.touch(config.value);
    isDirty.value = true;
    if (validated.value) validate();
  }

  /** Update a selected parameter through the core manager.
   * @param uuid Parameter definition UUID.
   * @param value New value.
   * @returns Nothing.
   */
  function setParameterValue(uuid: string, value: unknown): void {
    if (!selectedEntry.value) return;
    manager.setParameterValue(selectedEntry.value.container, uuid, value);
    changed();
  }

  /** Update a selected reference through the core manager.
   * @param uuid Reference definition UUID.
   * @param targetUuid Target instance UUID.
   * @returns Nothing.
   */
  function setReferenceTarget(uuid: string, targetUuid: string): void {
    if (!selectedEntry.value) return;
    manager.setReferenceTarget(selectedEntry.value.container, uuid, targetUuid);
    changed();
  }

  /** Save values locally with explicit Map serialization for every storage driver.
   * @returns Whether saving succeeded.
   */
  async function saveConfig(): Promise<boolean> {
    if (!config.value) return false;
    isLoading.value = true;
    error.value = null;
    try {
      const snapshot: StoredConfig = {
        ...config.value,
        containers: config.value.containers.map(serialize),
      };
      await storage.setItem(STORAGE_KEY, snapshot);
      isDirty.value = false;
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /** Restore the locally saved configuration.
   * @returns Whether a saved configuration was restored.
   */
  async function loadConfig(): Promise<boolean> {
    isLoading.value = true;
    error.value = null;
    try {
      const saved = await storage.getItem<StoredConfig>(STORAGE_KEY);
      if (!saved) return false;
      const definition = modules.value.find((item) => item.shortName === saved.moduleRef);
      if (!definition) throw new Error(`BSWMD module not found: ${saved.moduleRef}`);
      const restored = { ...saved, containers: saved.containers.map(deserialize) };
      collectContainers(restored, definition);
      config.value = restored;
      selectContainer(restored.containers[0]?.uuid ?? '');
      isDirty.value = false;
      validated.value = false;
      violations.value = [];
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    modules,
    config,
    module,
    entries,
    selectedEntry,
    selectedKey,
    parameterData,
    referenceData,
    referenceOptions,
    isDirty,
    isLoading,
    error,
    violations,
    validated,
    selectContainer,
    createConfig,
    validate,
    setParameterValue,
    setReferenceTarget,
    saveConfig,
    loadConfig,
  };
});
