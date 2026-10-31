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
import { cloneConfiguration } from '@/core/config/ConfigClone';
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
const LIBRARY_KEY = 'autosar-config-sets-v3';
interface StoredLibrary {
  sets: StoredConfig[];
  activeUuid?: string;
  modulePreferences?: Record<string, ModulePreference>;
}
/** Per-module editor inclusion and explicit operation switches. */
export interface ModulePreference {
  included: boolean;
  generation: boolean;
  validation: boolean;
}

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
  const modulePreferences = ref<Record<string, ModulePreference>>(
    Object.fromEntries(
      modules.value.map((item) => [
        item.shortName,
        { included: true, generation: true, validation: true },
      ])
    )
  );
  const manager = new ConfigInstanceManager(modules.value);
  const engine = new ConstraintEngine();
  engine.registerRules([...DefinitionConstraints, ...DemConstraints]);
  const configSets = ref<ConfigInstance[]>([]);
  const activeUuid = ref<string>();
  const config = computed(
    () => configSets.value.find((set) => set.uuid === activeUuid.value) ?? null
  );
  const initialized = ref(false);
  let initializing: Promise<boolean> | undefined;
  let revision = 0;
  let writes: Promise<unknown> = Promise.resolve();
  const selectedContainerUuid = ref<string>();
  const selectedFieldUuid = ref<string>();
  const isDirty = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const violations = ref<ConstraintViolation[]>([]);
  const validated = ref(false);
  const module = computed(() =>
    modules.value.find(
      (item) => item.shortName === config.value?.moduleRef && item.version === config.value?.version
    )
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

  const summaries = computed(() =>
    configSets.value.map((set) => {
      const definition = modules.value.find(
        (item) => item.shortName === set.moduleRef && item.version === set.version
      );
      return {
        uuid: set.uuid,
        name: set.name ?? set.moduleRef,
        module: set.moduleRef,
        lastModified: set.lastModified,
        containerCount: definition ? collectContainers(set, definition).length : 0,
        errorCount: definition
          ? engine.validate(set, definition).filter((item) => item.severity === 'ERROR').length
          : 0,
      };
    })
  );
  const childOptions = computed(() =>
    config.value
      ? manager.getAddOptions(config.value, selectedEntry.value?.container.uuid ?? null)
      : []
  );
  const removalReason = computed(() =>
    config.value && selectedEntry.value
      ? manager.getRemovalReason(config.value, selectedEntry.value.container.uuid)
      : '请选择容器'
  );
  const cloneReason = computed(() => {
    if (!config.value || !selectedEntry.value) return '请选择容器';
    const parent = manager.findParent(config.value, selectedEntry.value.container.uuid);
    return manager
      .getAddOptions(config.value, parent?.uuid ?? null)
      .find((item) => item.definition.uuid === selectedEntry.value?.container.definitionRef)
      ?.disabledReason;
  });

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
   * @param name Optional set name; interactive callers use createConfigSet to persist first.
   * @returns Nothing.
   */
  function createConfig(moduleName = modules.value[0]?.shortName, name?: string): void {
    const definition = modules.value.find((item) => item.shortName === moduleName);
    if (!definition) throw new Error('No BSWMD module is available');
    const created = manager.createFromBswmd(definition);
    created.name = name?.trim() || `${definition.shortName} 配置 ${configSets.value.length + 1}`;
    configSets.value.push(created);
    activeUuid.value = created.uuid;
    initialized.value = true;
    selectContainer(created.containers[0]?.uuid ?? '');
    changed();
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
    revision++;
    validate();
  }

  /** Initialize once when entering home or workspace, retaining edits across navigation.
   * @returns Whether initialization succeeded (including an empty library).
   */
  async function initialize(): Promise<boolean> {
    if (initialized.value) return true;
    if (!initializing)
      initializing = loadConfig()
        .then(() => !error.value)
        .finally(() => {
          initializing = undefined;
        });
    return initializing;
  }

  /** Create and activate a named set after safely saving pending edits.
   * @param name Non-empty display name.
   * @param moduleName Discovered module name.
   * @returns Whether the new library was saved.
   */
  async function createConfigSet(
    name: string,
    moduleName = modules.value[0]?.shortName
  ): Promise<boolean> {
    if (!name.trim()) throw new Error('请输入配置集名称');
    if (!(await initialize()) || (isDirty.value && !(await saveConfig()))) return false;
    createConfig(moduleName, name);
    return saveConfig();
  }

  /** Switch only after persisting the outgoing edits; failed saves retain the current set.
   * @param uuid Set UUID to activate.
   * @returns Whether switching and persistence succeeded.
   */
  async function switchConfigSet(uuid: string): Promise<boolean> {
    if (!configSets.value.some((set) => set.uuid === uuid)) return false;
    if (isDirty.value && !(await saveConfig())) return false;
    activeUuid.value = uuid;
    selectContainer(config.value?.containers[0]?.uuid ?? '');
    revision++;
    isDirty.value = true;
    validate();
    return saveConfig();
  }

  /** Deep-clone and activate a set with all internal references remapped.
   * @param uuid Source set UUID.
   * @returns Whether the cloned library was saved.
   */
  async function cloneConfigSet(uuid: string): Promise<boolean> {
    const source = configSets.value.find((set) => set.uuid === uuid);
    if (!source || (isDirty.value && !(await saveConfig()))) return false;
    const base = source.name ?? source.moduleRef;
    let name = `${base}_2`;
    for (let suffix = 3; configSets.value.some((set) => set.name === name); suffix++)
      name = `${base}_${suffix}`;
    const clone = cloneConfiguration(source, name);
    configSets.value.push(clone);
    activeUuid.value = clone.uuid;
    selectContainer(clone.containers[0]?.uuid ?? '');
    changed();
    return saveConfig();
  }

  /** Delete a set after the UI obtains confirmation and persist the remaining library.
   * @param uuid Confirmed set UUID.
   * @returns Whether deletion succeeded; a failed write restores the deleted set.
   */
  async function deleteConfigSet(uuid: string): Promise<boolean> {
    const index = configSets.value.findIndex((set) => set.uuid === uuid);
    if (index < 0 || (isDirty.value && !(await saveConfig()))) return false;
    const previousActive = activeUuid.value;
    const previousSelection = selectedContainerUuid.value;
    const previousField = selectedFieldUuid.value;
    const [removed] = configSets.value.splice(index, 1);
    if (activeUuid.value === uuid) {
      activeUuid.value = configSets.value[0]?.uuid;
      selectContainer(config.value?.containers[0]?.uuid ?? '');
    }
    revision++;
    isDirty.value = true;
    validate();
    if (await saveConfig()) return true;
    configSets.value.splice(index, 0, removed);
    activeUuid.value = previousActive;
    selectContainer(previousSelection ?? '', previousField);
    revision++;
    validate();
    return false;
  }

  /** Add a direct child through core lifecycle validation and select the inserted instance.
   * @param definitionUuid Definition allowed under the selected parent (or module root).
   * @returns New instance, or undefined when no set is open.
   */
  function addContainerInstance(definitionUuid: string): ConfigContainer | undefined {
    if (!config.value) return undefined;
    const added = manager.addContainerInstance(
      config.value,
      selectedEntry.value?.container.uuid ?? null,
      definitionUuid
    );
    selectContainer(added.uuid);
    changed();
    return added;
  }

  /** Remove a confirmed instance; deleting the selection or its ancestor selects the parent.
   * @param uuid Confirmed container UUID.
   * @returns Nothing.
   */
  function removeContainerInstance(uuid: string): void {
    if (!config.value) return;
    const parent = manager.findParent(config.value, uuid);
    manager.removeContainerInstance(config.value, uuid);
    if (!selectedEntry.value) selectContainer(parent?.uuid ?? '');
    changed();
  }

  /** Clone the selected subtree through the core and select its copy.
   * @returns New subtree, or undefined without a selection.
   */
  function cloneContainerInstance(): ConfigContainer | undefined {
    if (!config.value || !selectedEntry.value) return undefined;
    const clone = manager.cloneContainerInstance(config.value, selectedEntry.value.container.uuid);
    selectContainer(clone.uuid);
    changed();
    return clone;
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

  /** Rename the selected instance without changing its UUID or references.
   * @param name Non-empty instance short name, unique among siblings.
   * @returns Nothing; throws for invalid names.
   */
  function renameContainer(name: string): void {
    if (!config.value || !selectedEntry.value) return;
    const clean = name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean))
      throw new Error('实例名称须为字母、数字或下划线，且不能以数字开头');
    const parent = manager.findParent(config.value, selectedEntry.value.container.uuid);
    const siblings = parent?.subContainers ?? config.value.containers;
    if (
      siblings.some(
        (item) => item.uuid !== selectedEntry.value?.container.uuid && item.shortName === clean
      )
    )
      throw new Error('同级实例名称已存在');
    selectedEntry.value.container.shortName = clean;
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
    isLoading.value = true;
    error.value = null;
    const savedRevision = revision;
    try {
      const snapshot: StoredLibrary = {
        activeUuid: activeUuid.value,
        modulePreferences: JSON.parse(JSON.stringify(modulePreferences.value)) as Record<
          string,
          ModulePreference
        >,
        sets: configSets.value.map((set) => ({
          ...set,
          containers: set.containers.map(serialize),
        })),
      };
      // Serialize writes so a slow earlier save cannot overwrite a newer library snapshot.
      const write = writes.then(() => storage.setItem(LIBRARY_KEY, snapshot));
      writes = write.catch(() => undefined);
      await write;
      if (revision === savedRevision) isDirty.value = false;
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
      let library = await storage.getItem<StoredLibrary>(LIBRARY_KEY);
      if (!library) {
        const legacy = await storage.getItem<StoredConfig>(STORAGE_KEY);
        if (legacy) library = { sets: [legacy], activeUuid: legacy.uuid };
      }
      const restored = (library?.sets ?? []).map((saved) => {
        const definition = modules.value.find(
          (item) => item.shortName === saved.moduleRef && item.version === saved.version
        );
        if (!definition)
          throw new Error(`BSWMD module not found: ${saved.moduleRef} (${saved.version})`);
        const set = {
          ...saved,
          name: saved.name ?? saved.moduleRef,
          containers: saved.containers.map(deserialize),
        };
        collectContainers(set, definition);
        return set;
      });
      configSets.value = restored;
      if (library?.modulePreferences)
        Object.assign(modulePreferences.value, library.modulePreferences);
      activeUuid.value =
        restored.find((set) => set.uuid === library?.activeUuid)?.uuid ?? restored[0]?.uuid;
      selectContainer(config.value?.containers[0]?.uuid ?? '');
      revision++;
      isDirty.value = false;
      initialized.value = true;
      validate();
      return restored.length > 0;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    modules,
    modulePreferences,
    configSets,
    activeUuid,
    summaries,
    childOptions,
    removalReason,
    cloneReason,
    initialize,
    createConfigSet,
    switchConfigSet,
    cloneConfigSet,
    deleteConfigSet,
    addContainerInstance,
    removeContainerInstance,
    cloneContainerInstance,
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
    renameContainer,
    setReferenceTarget,
    saveConfig,
    loadConfig,
  };
});
