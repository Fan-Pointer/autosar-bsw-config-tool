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
import {
  exportJson,
  importJson,
  importError,
  serializeConfig,
  hydrateConfig,
} from '@/core/io/ConfigJson';
import { exportArxml, importArxml } from '@/core/io/Arxml';
import { exportCsv } from '@/core/io/Csv';
import { planImport } from '@/core/io/ImportPlan';
import type {
  ConflictStrategy,
  ExportFormat,
  ImportFormat,
  ImportPlan,
  ImportSession,
} from '@/core/io/IoTypes';
import { generateUUID } from '@/utils/uuid';
import { HistoryStack } from '@/core/history/HistoryStack';
import { configurationDelta } from '@/core/history/ConfigDelta';
import { commonParameters, batchSkipReason } from '@/core/config/BatchEdit';

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
  const selectedContainerUuids = ref<string[]>([]);
  const histories = new Map<string, HistoryStack>();
  const historyRevision = ref(0);
  const activeHistory = computed(() => {
    void historyRevision.value;
    return activeUuid.value ? histories.get(activeUuid.value) : undefined;
  });
  const canUndo = computed(() => {
    void historyRevision.value;
    return activeHistory.value?.canUndo ?? false;
  });
  const canRedo = computed(() => {
    void historyRevision.value;
    return activeHistory.value?.canRedo ?? false;
  });
  const undoLabel = computed(() => {
    void historyRevision.value;
    return activeHistory.value?.undoLabel ?? '';
  });
  const redoLabel = computed(() => {
    void historyRevision.value;
    return activeHistory.value?.redoLabel ?? '';
  });
  const isDirty = ref(false);
  const isLoading = ref(false);
  const isImporting = ref(false);
  const importPlans = new WeakMap<ImportSession, { key: string; plan: ImportPlan }>();
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
  const selectedEntries = computed(() =>
    entries.value.filter((entry) => selectedContainerUuids.value.includes(entry.container.uuid))
  );
  const batchParameters = computed(() => commonParameters(selectedEntries.value));
  const danglingReferences = computed(() => {
    const existing = new Set(entries.value.map((entry) => entry.container.uuid));
    return [...(selectedEntry.value?.container.references.values() ?? [])]
      .filter((reference) => reference.targetUuid && !existing.has(reference.targetUuid))
      .map((reference) => reference.definitionRef);
  });
  const selectedKey = computed(() =>
    selectedFieldUuid.value
      ? `${selectedContainerUuid.value}:${selectedFieldUuid.value}`
      : selectedContainerUuid.value
  );
  const parameterData = computed(() =>
    Object.fromEntries(
      (selectedEntry.value?.definition.parameters ?? []).map((parameter) => [
        parameter.uuid,
        selectedEntry.value?.container.parameters.get(parameter.uuid)?.value,
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
    selectedContainerUuids.value = uuid ? [uuid] : [];
  }

  /** Select a visible tree range or toggle one instance without including definition nodes.
   * @param uuid Clicked instance. @param toggle Ctrl/Cmd modifier. @param range Shift modifier.
   * @param visible Tree order after filtering. @returns Nothing.
   */
  function selectContainers(
    uuid: string,
    toggle: boolean,
    range: boolean,
    visible: string[]
  ): void {
    const previous = selectedContainerUuid.value;
    let selected = toggle ? [...selectedContainerUuids.value] : [uuid];
    if (range && previous && visible.includes(previous) && visible.includes(uuid)) {
      const from = visible.indexOf(previous),
        to = visible.indexOf(uuid);
      selected = visible.slice(Math.min(from, to), Math.max(from, to) + 1);
    } else if (toggle)
      selected = selected.includes(uuid)
        ? selected.filter((id) => id !== uuid)
        : [...selected, uuid];
    selectedContainerUuid.value = uuid;
    selectedFieldUuid.value = undefined;
    selectedContainerUuids.value = selected;
  }

  function selection() {
    return {
      uuid: selectedContainerUuid.value,
      field: selectedFieldUuid.value,
      multiple: [...selectedContainerUuids.value],
    };
  }
  function edit<T>(label: string, action: () => T): T {
    const set = config.value;
    if (!set) return action();
    const before = serializeConfig(set),
      priorSelection = selection();
    const result = action();
    changed();
    const delta = configurationDelta(before, serializeConfig(set));
    const nextSelection = selection(),
      setUuid = set.uuid;
    const replay = (forward: boolean): void => {
      const index = configSets.value.findIndex((item) => item.uuid === setUuid);
      if (index < 0) throw new Error('历史记录所属配置集已不存在');
      configSets.value[index] = delta(configSets.value[index], forward);
      const selected = forward ? nextSelection : priorSelection;
      selectedContainerUuid.value = selected.uuid;
      selectedFieldUuid.value = selected.field;
      selectedContainerUuids.value = [...selected.multiple];
      // Replay restores the original lastModified exactly; touching here would break lossless undo.
      revision++;
      isDirty.value = true;
      validate();
    };
    let history = histories.get(setUuid);
    if (!history) {
      history = new HistoryStack();
      histories.set(setUuid, history);
    }
    history.push({
      label,
      timestamp: Date.now(),
      undo: () => replay(false),
      redo: () => replay(true),
    });
    historyRevision.value++;
    return result;
  }

  /** @returns Whether the active set's latest edit was undone. */
  function undo(): boolean {
    assertEditable();
    const result = activeHistory.value?.undo() ?? false;
    historyRevision.value++;
    return result;
  }
  /** @returns Whether the active set's latest undone edit was replayed. */
  function redo(): boolean {
    assertEditable();
    const result = activeHistory.value?.redo() ?? false;
    historyRevision.value++;
    return result;
  }

  /** Apply one shared parameter as a single reversible operation.
   * @param uuid Shared definition UUID. @param value Proposed typed value.
   * @returns Success count and per-instance skip reasons.
   */
  function batchSetParameter(uuid: string, value: unknown): { success: number; skipped: string[] } {
    assertEditable();
    const definition = batchParameters.value.find((p) => p.uuid === uuid);
    if (!definition) throw new Error('只能修改所选实例共有的参数');
    const skipped: string[] = [];
    const writable = selectedEntries.value.filter((entry) => {
      const local = entry.definition.parameters.find((p) => p.uuid === uuid)!;
      const reason = batchSkipReason(entry, local, value);
      if (reason) skipped.push(`${entry.path}：${reason}`);
      return !reason;
    });
    if (writable.length)
      edit(`批量修改 ${definition.shortName}`, () => {
        for (const entry of writable) manager.setParameterValue(entry.container, uuid, value);
      });
    return { success: writable.length, skipped };
  }

  /** Create the initial editable tree from a discovered module.
   * @param moduleName Module short name; defaults to the first loaded definition.
   * @param name Optional set name; interactive callers use createConfigSet to persist first.
   * @returns Nothing.
   */
  function createConfig(moduleName = modules.value[0]?.shortName, name?: string): void {
    assertEditable();
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
    assertEditable();
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
    assertEditable();
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
    assertEditable();
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
    assertEditable();
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
    if (await saveConfig()) {
      histories.delete(uuid);
      historyRevision.value++;
      return true;
    }
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
    assertEditable();
    if (!config.value) return undefined;
    return edit('新增实例', () => {
      const added = manager.addContainerInstance(
        config.value!,
        selectedEntry.value?.container.uuid ?? null,
        definitionUuid
      );
      selectContainer(added.uuid);
      return added;
    });
  }

  /** Remove a confirmed instance; deleting the selection or its ancestor selects the parent.
   * @param uuid Confirmed container UUID.
   * @returns Nothing.
   */
  function removeContainerInstance(uuid: string): void {
    assertEditable();
    if (!config.value) return;
    edit('删除实例', () => {
      const parent = manager.findParent(config.value!, uuid);
      manager.removeContainerInstance(config.value!, uuid);
      if (!selectedEntry.value) selectContainer(parent?.uuid ?? '');
      selectedContainerUuids.value = selectedContainerUuids.value.filter((id) =>
        entries.value.some((entry) => entry.container.uuid === id)
      );
    });
  }

  /** Clone the selected subtree through the core and select its copy.
   * @returns New subtree, or undefined without a selection.
   */
  function cloneContainerInstance(): ConfigContainer | undefined {
    assertEditable();
    if (!config.value || !selectedEntry.value) return undefined;
    return edit('复制实例', () => {
      const clone = manager.cloneContainerInstance(
        config.value!,
        selectedEntry.value!.container.uuid
      );
      selectContainer(clone.uuid);
      return clone;
    });
  }

  /** Update a selected parameter through the core manager.
   * @param uuid Parameter definition UUID.
   * @param value New value.
   * @returns Nothing.
   */
  function setParameterValue(uuid: string, value: unknown): void {
    assertEditable();
    if (!selectedEntry.value) return;
    const entry = selectedEntry.value;
    const definition = entry.definition.parameters.find((p) => p.uuid === uuid);
    if (!definition || definition.readOnly) return;
    if (Object.is(entry.container.parameters.get(uuid)?.value, value)) return;
    edit(`修改 ${definition.shortName}`, () => {
      if (!entry.container.parameters.has(uuid))
        entry.container.parameters.set(uuid, {
          definitionRef: uuid,
          value: undefined,
          isConfigured: false,
        });
      manager.setParameterValue(entry.container, uuid, value);
    });
  }

  /** Rename the selected instance without changing its UUID or references.
   * @param name Non-empty instance short name, unique among siblings.
   * @returns Nothing; throws for invalid names.
   */
  function renameContainer(name: string): void {
    assertEditable();
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
    if (selectedEntry.value.container.shortName === clean) return;
    edit('重命名实例', () => {
      selectedEntry.value!.container.shortName = clean;
    });
  }

  /** Update a selected reference through the core manager.
   * @param uuid Reference definition UUID.
   * @param targetUuid Target instance UUID.
   * @returns Nothing.
   */
  function setReferenceTarget(uuid: string, targetUuid: string): void {
    assertEditable();
    if (!selectedEntry.value) return;
    const entry = selectedEntry.value;
    const definition = entry.definition.references.find((r) => r.uuid === uuid);
    if (!definition || entry.container.references.get(uuid)?.targetUuid === targetUuid) return;
    edit(`修改引用 ${definition.shortName}`, () => {
      if (!entry.container.references.has(uuid))
        entry.container.references.set(uuid, { definitionRef: uuid, targetUuid: '' });
      manager.setReferenceTarget(entry.container, uuid, targetUuid);
    });
  }

  /** Save values locally with explicit Map serialization for every storage driver.
   * @returns Whether saving succeeded.
   */
  async function saveConfig(): Promise<boolean> {
    if (isImporting.value) return false;
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
    if (isImporting.value) return false;
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
      histories.clear();
      historyRevision.value++;
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

  function assertEditable(): void {
    if (isImporting.value) throw new Error('正在应用导入，请稍后编辑');
  }

  function importBaseline(): string {
    return JSON.stringify({
      activeUuid: activeUuid.value,
      sets: configSets.value.map(serializeConfig),
      modulePreferences: modulePreferences.value,
    });
  }

  /** Parse a file into an isolated preview session without writing storage or editor state.
   * @param text File content.
   * @param format Explicit file format.
   * @param target Current set or a new set.
   * @returns A session bound to the exact project snapshot being previewed.
   */
  function prepareImport(
    text: string,
    format: ImportFormat,
    target: 'current' | 'new' = 'current'
  ): ImportSession {
    try {
      const incoming =
        format === 'json' ? importJson(text, modules.value) : importArxml(text, modules.value);
      if (
        target === 'current' &&
        config.value &&
        (incoming.moduleRef !== config.value.moduleRef || incoming.version !== config.value.version)
      )
        throw new Error('文件模块或版本与当前配置集不一致，请选择新建配置集');
      return {
        incoming,
        targetUuid: target === 'current' ? config.value?.uuid : undefined,
        baseline: importBaseline(),
      };
    } catch (reason) {
      throw new Error(importError(reason));
    }
  }

  /** Compute preview counts and four-column conflict rows for a bound session.
   * @param session Previously parsed file and project snapshot.
   * @param strategy Selected conflict strategy.
   * @returns Detached candidate and preview statistics.
   */
  function previewImport(session: ImportSession, strategy: ConflictStrategy): ImportPlan {
    if (session.baseline !== importBaseline())
      throw new Error('工程已在预览后更改，请重新读取文件并预览');
    const definition = modules.value.find(
      (item) =>
        item.shortName === session.incoming.moduleRef && item.version === session.incoming.version
    );
    if (!definition) throw new Error('导入模块定义已不可用');
    const target = configSets.value.find((set) => set.uuid === session.targetUuid) ?? null;
    const key = JSON.stringify([session.targetUuid, strategy, exportJson(session.incoming)]);
    let cached = importPlans.get(session);
    if (!cached || cached.key !== key) {
      cached = { key, plan: planImport(target, session.incoming, definition, strategy) };
      importPlans.set(session, cached);
    }
    // Keep preview identities stable, while handing callers a detached candidate they cannot use to alter the cache.
    return {
      ...cached.plan,
      conflicts: cached.plan.conflicts.map((row) => ({ ...row })),
      result: hydrateConfig(serializeConfig(cached.plan.result), modules.value),
    };
  }

  /** Persist a staged library atomically, publishing it only after a successful local write.
   * @param session Parsed file bound to its original project snapshot.
   * @param strategy Conflict strategy shown in preview.
   * @returns Whether application succeeded; errors leave configuration, selection and dirty state intact.
   */
  async function applyImport(session: ImportSession, strategy: ConflictStrategy): Promise<boolean> {
    if (isLoading.value || isImporting.value) {
      error.value = '正在保存配置，请稍后应用导入';
      return false;
    }
    isImporting.value = true;
    isLoading.value = true;
    error.value = null;
    try {
      // Keep the entire live snapshot untouched until the single IndexedDB/library write succeeds.
      const candidate = previewImport(session, strategy).result;
      if (session.targetUuid) candidate.lastModified = Date.now();
      else if (configSets.value.some((set) => set.uuid === candidate.uuid))
        candidate.uuid = generateUUID();
      const definition = modules.value.find(
        (item) => item.shortName === candidate.moduleRef && item.version === candidate.version
      )!;
      const nextViolations = engine.validate(candidate, definition);
      const next = session.targetUuid
        ? configSets.value.map((set) => (set.uuid === session.targetUuid ? candidate : set))
        : [...configSets.value, candidate];
      const snapshot: StoredLibrary = {
        sets: next.map((set) => ({ ...set, containers: set.containers.map(serialize) })),
        activeUuid: candidate.uuid,
        modulePreferences: JSON.parse(JSON.stringify(modulePreferences.value)) as Record<
          string,
          ModulePreference
        >,
      };
      const write = writes.then(() => storage.setItem(LIBRARY_KEY, snapshot));
      writes = write.catch(() => undefined);
      await write;
      configSets.value = next;
      histories.delete(candidate.uuid);
      historyRevision.value++;
      activeUuid.value = candidate.uuid;
      selectContainer(candidate.containers[0]?.uuid ?? '');
      initialized.value = true;
      revision++;
      isDirty.value = false;
      violations.value = nextViolations;
      validated.value = true;
      return true;
    } catch (reason) {
      error.value = importError(reason);
      return false;
    } finally {
      isImporting.value = false;
      isLoading.value = false;
    }
  }

  /** Export the active configuration using definition-driven core codecs.
   * @param format Requested local download format.
   * @returns File content; throws a readable error when no configuration is active.
   */
  function exportConfig(format: ExportFormat): string {
    if (!config.value || !module.value) throw new Error('请先打开配置集');
    return format === 'json'
      ? exportJson(config.value)
      : format === 'arxml'
        ? exportArxml(config.value, module.value)
        : exportCsv(config.value, module.value);
  }

  return {
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
    selectedFieldUuid,
    selectedContainerUuids,
    selectContainers,
    selectedEntries,
    batchParameters,
    batchSetParameter,
    danglingReferences,
    isImporting,
    prepareImport,
    previewImport,
    applyImport,
    exportConfig,
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
