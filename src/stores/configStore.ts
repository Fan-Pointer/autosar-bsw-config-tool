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
import {
  evaluateOutputReadiness,
  outputViolations,
  type OutputCheckResult,
} from '@/core/output/OutputGate';
import { DemConstraints } from '@/modules/dem/DemConstraints';
import {
  exportJson,
  importJson,
  importError,
  serializeConfig,
  hydrateConfig,
  record,
  string,
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
import { planRequiredDefaults } from '@/core/config/RequiredDefaults';
import { createParameterValue } from '@/core/config/ConfigValues';

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
const RECOVERY_KEY = 'autosar-recovery-state';
const DRAFT_KEY = 'autosar-config-sets-v4-draft';
/** Original records are kept even when their structure cannot be interpreted. */
export interface QuarantinedRecord {
  kind: 'configuration' | 'module' | 'preference' | 'library' | 'draft';
  raw: unknown;
  name: string;
  moduleRef: string;
  version: string;
  reason: string;
  quarantinedAt: string;
}
interface DataSafety {
  locked: boolean;
  reason: string | null;
  snapshotKey: string | null;
}
interface StoredLibrary {
  [key: string]: unknown;
  schemaVersion?: number;
  quarantinedSets?: QuarantinedRecord[];
  dataSafety?: DataSafety;
  importedModules?: BswmdModule[];
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
    references: new Map(
      container.references.map(([id, reference]) => [
        id,
        {
          ...reference,
          isConfigured: reference.isConfigured ?? Boolean(reference.targetUuid),
        },
      ])
    ),
    subContainers: container.subContainers.map(deserialize),
  };
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Storage is untrusted too. Validate structure without rejecting an unfinished configuration
// or normalizing away unknown fields: recovery must not turn an invalid value into a default.
function restoreStored(raw: unknown, definitions: BswmdModule[]): ConfigInstance {
  const data = record(raw, '配置集');
  const moduleRef = string(data.moduleRef, 'moduleRef');
  const version = string(data.version, 'version');
  const definition = definitions.find(
    (item) => item.shortName === moduleRef && item.version === version
  );
  if (!definition) throw new Error(`BSWMD module not found: ${moduleRef} (${version})`);
  const ids = new Set([string(data.uuid, 'uuid')]);
  const visit = (items: unknown, allowed: BswmdModule['containers'], depth = 0): void => {
    if (!Array.isArray(items) || depth > 128) throw new Error('容器结构无效或嵌套过深');
    const names = new Set<string>();
    for (const item of items) {
      const child = record(item, '容器');
      const id = string(child.uuid, '容器 uuid');
      const name = string(child.shortName, '容器名称');
      if (ids.has(id) || names.has(name)) throw new Error('容器 UUID 或同级名称重复');
      ids.add(id);
      names.add(name);
      const def = allowed.find((entry) => entry.uuid === child.definitionRef);
      if (!def) throw new Error(`${name}: unknown definitionRef ${String(child.definitionRef)}`);
      for (const field of ['parameters', 'references'] as const) {
        const pairs = child[field];
        if (!Array.isArray(pairs)) throw new Error(`${name}/${field}: 应为键值数组`);
        const keys = new Set<string>();
        for (const pair of pairs) {
          if (!Array.isArray(pair) || pair.length !== 2)
            throw new Error(`${name}/${field}: 键值无效`);
          const key = string(pair[0], '字段键');
          const value = record(pair[1], '字段');
          if (
            keys.has(key) ||
            value.definitionRef !== key ||
            !def[field].some((entry) => entry.uuid === key)
          )
            throw new Error(`${name}/${field}: 未知或重复字段 ${key}`);
          keys.add(key);
        }
      }
      visit(child.subContainers, def.subContainers, depth + 1);
    }
  };
  visit(data.containers, definition.containers);
  const saved = cloneData(data) as unknown as StoredConfig;
  return { ...saved, name: saved.name ?? moduleRef, containers: saved.containers.map(deserialize) };
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
  const importedModules = ref<BswmdModule[]>([]);
  const modulePreferences = ref<Record<string, ModulePreference>>(
    Object.fromEntries(
      modules.value.map((item) => [
        item.shortName,
        { included: true, generation: true, validation: true },
      ])
    )
  );
  let manager = new ConfigInstanceManager(modules.value);
  const configSets = ref<ConfigInstance[]>([]);
  const activeUuid = ref<string>();
  const config = computed(
    () => configSets.value.find((set) => set.uuid === activeUuid.value) ?? null
  );
  const initialized = ref(false);
  const quarantinedSets = ref<QuarantinedRecord[]>([]);
  const dataSafety = ref<DataSafety>({ locked: false, reason: null, snapshotKey: null });
  const recoveryWarning = ref<string | null>(null);
  const draftUuids = ref<string[]>([]);
  let originalRaw: unknown = null;
  let sourceKey = LIBRARY_KEY;
  let storageInspected = false;
  let recovering = false;
  let libraryExtras: Record<string, unknown> = {};
  let draftRaw: unknown = null;
  let draftLocked = false;
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
      .filter(
        (reference) =>
          reference.isConfigured && reference.targetUuid && !existing.has(reference.targetUuid)
      )
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
          .filter((entry) =>
            reference.destinationRef
              ? entry.definition.definitionPath === reference.destinationRef
              : entry.definition.shortName === reference.destinationContainerType
          )
          .map((entry) => ({
            uuid: entry.container.uuid,
            label: entry.path,
          })),
      ])
    )
  );

  const referenceAddOptions = computed(() =>
    Object.fromEntries(
      (selectedEntry.value?.definition.references ?? []).map((reference) => [
        reference.uuid,
        config.value
          ? [null, ...entries.value.map((entry) => entry.container.uuid)].flatMap((parentUuid) =>
              manager
                .getAddOptions(config.value!, parentUuid)
                .filter((option) =>
                  reference.destinationRef
                    ? option.definition.definitionPath === reference.destinationRef
                    : option.definition.shortName === reference.destinationContainerType
                )
                .map((option) => ({
                  definitionUuid: option.definition.uuid,
                  parentUuid,
                  label: `${parentUuid ? entries.value.find((entry) => entry.container.uuid === parentUuid)?.path : '模块根'}/${option.definition.shortName}`,
                  disabledReason: option.disabledReason,
                }))
            )
          : [],
      ])
    )
  );

  /** Create a target under an explicitly chosen valid parent and assign it in one undo step.
   * @param referenceUuid Selected reference. @param definitionUuid Allowed target definition.
   * @param parentUuid Target parent, null for module roots. @returns Nothing.
   */
  function createReferenceTarget(
    referenceUuid: string,
    definitionUuid: string,
    parentUuid: string | null
  ): void {
    assertEditable();
    const source = selectedEntry.value;
    if (!config.value || !source) return;
    const option = referenceAddOptions.value[referenceUuid]?.find(
      (item) => item.definitionUuid === definitionUuid && item.parentUuid === parentUuid
    );
    if (!option || option.disabledReason)
      throw new Error(option?.disabledReason ?? '请先新增目标父容器或加载目标模块');
    edit('新增引用目标', () => {
      const target = manager.addContainerInstance(config.value!, parentUuid, definitionUuid);
      source.container.references.set(referenceUuid, {
        definitionRef: referenceUuid,
        targetUuid: target.uuid,
        isConfigured: true,
      });
    });
  }

  /** Add new module definitions and persist them alongside the configuration library.
   * @param definitions Parsed modules; existing module names cannot be replaced under live configurations.
   * @returns Whether the complete library was saved.
   */
  async function importModuleDefinitions(definitions: BswmdModule[]): Promise<boolean> {
    assertEditable();
    assertWritable();
    if (!(await initialize())) return false;
    assertWritable();
    const names = definitions.map((definition) => definition.shortName);
    if (
      new Set(names).size !== names.length ||
      names.some((name) => modules.value.some((item) => item.shortName === name))
    )
      throw new Error('模块已加载或名称重复；为保留现有配置的定义绑定，不覆盖已加载模块');
    const previousModules = [...modules.value],
      previousImported = [...importedModules.value];
    const previousPreferences = { ...modulePreferences.value };
    modules.value.push(...definitions);
    importedModules.value.push(...definitions);
    for (const definition of definitions)
      modulePreferences.value[definition.shortName] = {
        included: true,
        generation: true,
        validation: true,
      };
    manager = new ConfigInstanceManager(modules.value);
    revision++;
    if (await saveConfig()) return true;
    modules.value = previousModules;
    importedModules.value = previousImported;
    modulePreferences.value = previousPreferences;
    manager = new ConfigInstanceManager(modules.value);
    return false;
  }

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
          ? getOutputCheck(set, definition).issues.filter((item) => item.severity === 'ERROR')
              .length
          : 0,
      };
    })
  );
  const childOptions = computed(() =>
    config.value
      ? manager.getAddOptions(config.value, selectedEntry.value?.container.uuid ?? null)
      : []
  );
  /** Resolve lifecycle options for an explicit target without changing editor selection.
   * @param uuid Context instance UUID. @returns Core options and existing editing restrictions.
   */
  function containerActionsFor(uuid?: string) {
    const entry = entries.value.find((item) => item.container.uuid === uuid);
    const editReason = isImporting.value
      ? '正在应用导入，请稍后编辑'
      : isLoading.value
        ? '正在读写配置，请稍后编辑'
        : undefined;
    if (!config.value || !entry)
      return {
        entry,
        childOptions: [],
        editReason: editReason ?? '请选择容器实例',
        removalReason: '请选择容器实例',
        cloneReason: '请选择容器实例',
      };
    const parent = manager.findParent(config.value, entry.container.uuid);
    const cloneReason = manager
      .getAddOptions(config.value, parent?.uuid ?? null)
      .find((item) => item.definition.uuid === entry.container.definitionRef)?.disabledReason;
    return {
      entry,
      editReason,
      childOptions: manager.getAddOptions(config.value, entry.container.uuid),
      removalReason: manager.getRemovalReason(config.value, entry.container.uuid),
      cloneReason,
    };
  }
  const removalReason = computed(
    () => containerActionsFor(selectedEntry.value?.container.uuid).removalReason
  );
  const cloneReason = computed(
    () => containerActionsFor(selectedEntry.value?.container.uuid).cloneReason
  );

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

  /** Evaluate fresh output readiness with application-owned module rules.
   * @param target Configuration, defaults to the active set.
   * @param definition Matching definition, defaults to the active module.
   * @returns A same-action result; callers must never cache it across actions.
   */
  function getOutputCheck(target = config.value, definition = module.value): OutputCheckResult {
    if (!target || !definition) throw new Error('请先打开配置集');
    return evaluateOutputReadiness(target, definition, DemConstraints);
  }

  /** Validate the active configuration.
   * @param check Optional result from the same immediate output action.
   * @returns The current violations.
   */
  function validate(check?: OutputCheckResult): ConstraintViolation[] {
    violations.value =
      config.value && module.value ? outputViolations(check ?? getOutputCheck()) : [];
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
    if (dataSafety.value.locked) draftUuids.value.push(activeUuid.value!);
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
    if (dataSafety.value.locked) {
      validate();
      return true;
    }
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
    assertWritable();
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
    assertWritable();
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
   * @param parentUuid Explicit context parent; omitted for the toolbar's selected parent.
   * @returns New instance, or undefined when no set is open.
   */
  function addContainerInstance(
    definitionUuid: string,
    parentUuid: string | null = selectedEntry.value?.container.uuid ?? null
  ): ConfigContainer | undefined {
    assertEditable();
    if (!config.value) return undefined;
    return edit('新增实例', () => {
      const added = manager.addContainerInstance(config.value!, parentUuid, definitionUuid);
      selectContainer(added.uuid);
      return added;
    });
  }

  /** Select a confirmed choice and retain the replaced subtree in one undo record.
   * @param groupUuid Choice group UUID. @param candidateRef Candidate definition UUID.
   * @returns Nothing; invalid choices throw before mutation.
   */
  function selectChoice(groupUuid: string, candidateRef: string): void {
    assertEditable();
    if (!config.value) return;
    const group = manager.findContainer(config.value, groupUuid);
    if (group?.subContainers.length === 1 && group.subContainers[0].definitionRef === candidateRef)
      return;
    edit('切换 CHOICE 候选', () => {
      manager.selectChoice(config.value!, groupUuid, candidateRef);
      selectContainer(groupUuid);
    });
  }

  /** Explicitly confirm required metadata defaults across the active set in one undo step.
   * @returns Counts for the visible result; remaining excludes optional fields and references.
   */
  function confirmRequiredDefaults(): { confirmed: number; remaining: number } {
    assertEditable();
    if (!config.value || !module.value) throw new Error('请先打开配置集');
    const { assignments, remaining } = planRequiredDefaults(config.value, module.value);
    if (assignments.length)
      edit('一键确认建议值', () => {
        for (const { container, definition } of assignments) {
          if (!container.parameters.has(definition.uuid))
            container.parameters.set(definition.uuid, createParameterValue(definition));
          manager.setParameterValue(container, definition.uuid, definition.defaultValue);
        }
      });
    return { confirmed: assignments.length, remaining };
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

  /** Clone a subtree through the core and select its copy.
   * @param uuid Explicit context target; omitted for the toolbar's selected instance.
   * @returns New subtree, or undefined without a selection.
   */
  function cloneContainerInstance(
    uuid = selectedEntry.value?.container.uuid
  ): ConfigContainer | undefined {
    assertEditable();
    if (!config.value || !uuid) return undefined;
    return edit('复制实例', () => {
      const clone = manager.cloneContainerInstance(config.value!, uuid);
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
    const current = entry.container.parameters.get(uuid);
    if (current?.isConfigured && Object.is(current.value, value)) return;
    edit(`修改 ${definition.shortName}`, () => {
      if (!entry.container.parameters.has(uuid))
        entry.container.parameters.set(uuid, {
          definitionRef: uuid,
          description: definition.description,
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
    const current = entry.container.references.get(uuid);
    if (
      !definition ||
      (current?.targetUuid === targetUuid && current.isConfigured === Boolean(targetUuid))
    )
      return;
    edit(`修改引用 ${definition.shortName}`, () => {
      if (!entry.container.references.has(uuid))
        entry.container.references.set(uuid, {
          definitionRef: uuid,
          targetUuid: '',
          isConfigured: false,
        });
      manager.setReferenceTarget(entry.container, uuid, targetUuid);
    });
  }

  /** Save values locally with explicit Map serialization for every storage driver.
   * @returns Whether saving succeeded.
   */
  async function saveConfig(): Promise<boolean> {
    if (isImporting.value) return false;
    const toDraft = Boolean(activeUuid.value && draftUuids.value.includes(activeUuid.value));
    if (!toDraft) assertWritable();
    isLoading.value = true;
    error.value = null;
    const savedRevision = revision;
    try {
      const snapshot: StoredLibrary = {
        ...(toDraft ? {} : libraryExtras),
        schemaVersion: 4,
        importedModules: JSON.parse(JSON.stringify(importedModules.value)) as BswmdModule[],
        activeUuid: activeUuid.value,
        modulePreferences: JSON.parse(JSON.stringify(modulePreferences.value)) as Record<
          string,
          ModulePreference
        >,
        sets: configSets.value
          .filter((set) => toDraft === draftUuids.value.includes(set.uuid))
          .map((set) => ({
            ...set,
            containers: set.containers.map(serialize),
          })),
      };
      // Serialize writes so a slow earlier save cannot overwrite a newer library snapshot.
      const write = writes.then(() => persistLibrary(snapshot, toDraft));
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
    if (isImporting.value || recovering) return false;
    recovering = true;
    isLoading.value = true;
    error.value = null;
    try {
      sourceKey = LIBRARY_KEY;
      originalRaw = (await storage.getItem<unknown>(LIBRARY_KEY)) ?? null;
      if (originalRaw === null) {
        const legacy = (await storage.getItem<unknown>(STORAGE_KEY)) ?? null;
        if (legacy !== null) {
          originalRaw = legacy;
          sourceKey = STORAGE_KEY;
        }
      }
      storageInspected = true;
      quarantinedSets.value = [];
      recoveryWarning.value = null;
      draftUuids.value = [];
      draftLocked = false;
      const isolate = (
        raw: unknown,
        kind: QuarantinedRecord['kind'],
        reason: unknown,
        name = ''
      ): void => {
        const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        quarantinedSets.value.push({
          raw: cloneData(raw),
          kind,
          name: name || String(data.name ?? data.shortName ?? data.uuid ?? '无法识别的条目'),
          moduleRef: String(data.moduleRef ?? data.shortName ?? ''),
          version: String(data.version ?? ''),
          reason: reason instanceof Error ? reason.message : String(reason),
          quarantinedAt: new Date().toISOString(),
        });
      };
      let library: Record<string, unknown> = {};
      try {
        library =
          sourceKey === STORAGE_KEY
            ? { sets: [originalRaw] }
            : originalRaw === null
              ? { sets: [] }
              : record(originalRaw, '配置库');
        if (!Array.isArray(library.sets)) throw new Error('配置库 sets 应为数组');
        if (
          library.schemaVersion !== undefined &&
          library.schemaVersion !== 4 &&
          library.schemaVersion !== 3
        )
          throw new Error(`不支持的库版本 ${String(library.schemaVersion)}`);
      } catch (reason) {
        isolate(originalRaw, 'library', reason);
        library = {};
      }
      libraryExtras = cloneData(library);
      const restoredModules = [...loader.getAllModules()];
      const restoredImports: BswmdModule[] = [];
      const importDefinitions = (raw: unknown): void => {
        if (raw === undefined) return;
        if (!Array.isArray(raw)) {
          isolate(raw, 'module', '模块定义列表无效');
          return;
        }
        for (const item of raw) {
          try {
            // Parse for structural validation, retain original metadata (the parser normalizes some fields).
            const checked = new BswmdLoader().loadFromString(JSON.stringify(item));
            if (restoredModules.some((existing) => existing.shortName === checked.shortName))
              throw new Error('已保存的模块定义名称冲突');
            const definition = cloneData(item) as BswmdModule;
            restoredModules.push(definition);
            restoredImports.push(definition);
          } catch (reason) {
            isolate(item, 'module', reason);
          }
        }
      };
      importDefinitions(library.importedModules);
      const restored: ConfigInstance[] = [];
      const restoreSets = (raw: unknown, draft = false): void => {
        if (!Array.isArray(raw)) return;
        for (const item of raw) {
          try {
            const set = restoreStored(item, restoredModules);
            if (restored.some((existing) => existing.uuid === set.uuid))
              throw new Error('配置集 UUID 重复');
            restored.push(set);
            if (draft) draftUuids.value.push(set.uuid);
          } catch (reason) {
            isolate(item, draft ? 'draft' : 'configuration', reason);
            if (draft) draftLocked = true;
          }
        }
      };
      restoreSets(library.sets);
      const preferences: Record<string, ModulePreference> = Object.fromEntries(
        restoredModules.map((item) => [
          item.shortName,
          { included: true, generation: true, validation: true },
        ])
      );
      if (library.modulePreferences !== undefined) {
        try {
          for (const [name, value] of Object.entries(
            record(library.modulePreferences, '模块偏好')
          )) {
            try {
              const pref = record(value, name);
              if (
                !['included', 'generation', 'validation'].every(
                  (key) => typeof pref[key] === 'boolean'
                )
              )
                throw new Error('模块偏好开关应为布尔值');
              preferences[name] = cloneData(pref) as unknown as ModulePreference;
            } catch (reason) {
              isolate(value, 'preference', reason, name);
            }
          }
        } catch (reason) {
          isolate(library.modulePreferences, 'preference', reason);
        }
      }
      draftRaw = (await storage.getItem<unknown>(DRAFT_KEY)) ?? null;
      if (draftRaw !== null) {
        try {
          const draft = record(draftRaw, '草稿库');
          if (!Array.isArray(draft.sets)) throw new Error('草稿库 sets 应为数组');
          restoreSets(draft.sets, true);
        } catch (reason) {
          draftLocked = true;
          isolate(draftRaw, 'draft', reason);
        }
      }
      if (quarantinedSets.value.length) await protectOriginal();
      else dataSafety.value = { locked: false, reason: null, snapshotKey: null };
      modules.value = restoredModules;
      importedModules.value = restoredImports;
      manager = new ConfigInstanceManager(modules.value);
      configSets.value = restored;
      histories.clear();
      historyRevision.value++;
      modulePreferences.value = preferences;
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
      dataSafety.value = {
        locked: true,
        reason: `读取配置库失败：${error.value}`,
        snapshotKey: null,
      };
      return false;
    } finally {
      isLoading.value = false;
      recovering = false;
    }
  }

  /** Reject writes to the protected original library before touching memory or storage.
   * @returns Nothing; throws a DATA_LOCKED error while recovery is pending.
   */
  function assertWritable(): void {
    if (recovering) throw new Error('DATA_LOCKED：正在恢复原配置库，请稍后重试');
    if (dataSafety.value.locked) {
      error.value = `DATA_LOCKED：${dataSafety.value.reason}`;
      throw new Error(error.value);
    }
  }

  async function protectOriginal(): Promise<void> {
    let snapshotKey: string | null = null;
    try {
      const previous = await storage.getItem<{
        snapshotKey?: string;
        quarantinedSets?: QuarantinedRecord[];
      }>(RECOVERY_KEY);
      if (
        previous?.snapshotKey &&
        JSON.stringify(await storage.getItem(previous.snapshotKey)) === JSON.stringify(originalRaw)
      ) {
        snapshotKey = previous.snapshotKey;
        for (const item of quarantinedSets.value) {
          const prior = previous.quarantinedSets?.find(
            (p) => p.kind === item.kind && JSON.stringify(p.raw) === JSON.stringify(item.raw)
          );
          if (prior) item.quarantinedAt = prior.quarantinedAt;
        }
      }
      if (!snapshotKey) {
        snapshotKey = `autosar-recovery-snapshot-${new Date().toISOString()}-${generateUUID()}`;
        await storage.setItem(snapshotKey, cloneData(originalRaw));
      }
    } catch (reason) {
      snapshotKey = null;
      recoveryWarning.value = `永久快照未能写入，请立即导出原始数据：${String(reason)}`;
    }
    // Even quota/read failures must establish the in-memory lock; no original write is attempted.
    dataSafety.value = {
      locked: true,
      reason: `${quarantinedSets.value.length} 个条目无法安全恢复，原库已保护`,
      snapshotKey,
    };
    try {
      await storage.setItem(
        RECOVERY_KEY,
        cloneData({
          schemaVersion: 1,
          ...dataSafety.value,
          sourceKey,
          quarantinedSets: quarantinedSets.value,
          draftKey: DRAFT_KEY,
        })
      );
    } catch (reason) {
      recoveryWarning.value = `${recoveryWarning.value ?? ''} 隔离状态未能持久化，原库仍受保护；下次启动会重新检测。请先导出原始数据，再关闭页面：${String(reason)}`;
    }
  }

  async function persistLibrary(snapshot: StoredLibrary, toDraft = false): Promise<void> {
    if (toDraft) {
      if (draftLocked) throw new Error('DATA_LOCKED：草稿库也有未恢复条目，禁止覆盖');
      if (JSON.stringify((await storage.getItem(DRAFT_KEY)) ?? null) !== JSON.stringify(draftRaw))
        throw new Error('草稿库已在其他页面改变，请重新打开后再保存');
      await storage.setItem(DRAFT_KEY, snapshot);
      draftRaw = cloneData(snapshot);
      return;
    }
    assertWritable();
    const current = (await storage.getItem<unknown>(sourceKey)) ?? null;
    // Protect callers that use createConfig directly without first loading an existing library.
    if (
      (!storageInspected && current !== null) ||
      (storageInspected && JSON.stringify(current) !== JSON.stringify(originalRaw))
    ) {
      dataSafety.value = {
        locked: true,
        reason: '库尚未恢复或已在其他页面改变，请重新打开以保护原数据',
        snapshotKey: null,
      };
      assertWritable();
    }
    if (!storageInspected && (await storage.getItem(STORAGE_KEY)) != null) {
      dataSafety.value = {
        locked: true,
        reason: '存在尚未读取的旧配置，请先重新打开',
        snapshotKey: null,
      };
      assertWritable();
    }
    await storage.setItem(LIBRARY_KEY, snapshot);
    originalRaw = cloneData(snapshot);
    sourceKey = LIBRARY_KEY;
    storageInspected = true;
    libraryExtras = cloneData(snapshot);
  }

  /** Retrieve raw storage independently of whether any configuration can be decoded.
   * @returns Local-download Blob with rawJson separated from recovery metadata.
   */
  async function exportRawLibrary(): Promise<Blob> {
    const raw = await storage.getItem<unknown>(sourceKey);
    return new Blob(
      [
        JSON.stringify(
          {
            kind: 'autosar-bsw-raw-export',
            readme: {
              rawJson: '原配置库的原样 JSON 字符串，包含尚未恢复的条目；请保留完整内容。',
              recoveryState: '隔离原因、写锁与快照索引，仅用于说明恢复状态，不替代原配置数据。',
              draftLibrary: '锁定期间单独保存的新配置草稿，与原配置库分离；可能为空。',
            },
            exportedAt: new Date().toISOString(),
            sourceKey,
            rawJson: JSON.stringify(raw),
            recoveryState: { ...dataSafety.value, quarantinedSets: quarantinedSets.value },
            snapshotKeys: dataSafety.value.snapshotKey ? [dataSafety.value.snapshotKey] : [],
            backupIndex: (await storage.getItem('autosar-backup-index')) ?? [],
            draftLibrary: await storage.getItem(DRAFT_KEY),
          },
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
  }

  /** Delete only the named recovery copy after explicit UI confirmation; the original stays locked.
   * @param key Snapshot shown in the confirmation. @returns Nothing.
   */
  async function deleteRecoverySnapshot(key: string): Promise<void> {
    if (
      !key ||
      key !== dataSafety.value.snapshotKey ||
      !key.startsWith('autosar-recovery-snapshot-')
    )
      throw new Error('快照已改变，请重新查看详情');
    const current = await storage.getItem(sourceKey);
    if (JSON.stringify(current) !== JSON.stringify(originalRaw))
      throw new Error('原库已变化，不能删除恢复副本');
    await storage.removeItem(key);
    dataSafety.value.snapshotKey = null;
    await storage.setItem(
      RECOVERY_KEY,
      cloneData({
        schemaVersion: 1,
        ...dataSafety.value,
        sourceKey,
        quarantinedSets: quarantinedSets.value,
        draftKey: DRAFT_KEY,
      })
    );
  }

  /** Decode an isolated record against an exact historical asset without registering it for editing.
   * @param index Index of the isolated record. @returns Detached read-only view data.
   */
  async function openQuarantinedReadOnly(
    index: number
  ): Promise<{ config: ConfigInstance; module: BswmdModule }> {
    const entry = quarantinedSets.value[index];
    if (!entry || entry.kind !== 'configuration') throw new Error('请选择不兼容配置集');
    const legacySources = import.meta.glob<string>('../../bswmd/legacy/*.json', {
      query: '?raw',
      import: 'default',
    });
    for (const read of Object.values(legacySources)) {
      const definition = new BswmdLoader().loadFromString(await read());
      if (definition.shortName === entry.moduleRef && definition.version === entry.version)
        return { config: restoreStored(entry.raw, [definition]), module: definition };
    }
    throw new Error('没有匹配的准确历史定义；原始数据仍可导出取回');
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
    assertWritable();
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
      const nextViolations = outputViolations(getOutputCheck(candidate, definition));
      const next = session.targetUuid
        ? configSets.value.map((set) => (set.uuid === session.targetUuid ? candidate : set))
        : [...configSets.value, candidate];
      const snapshot: StoredLibrary = {
        ...libraryExtras,
        schemaVersion: 4,
        importedModules: JSON.parse(JSON.stringify(importedModules.value)) as BswmdModule[],
        sets: next
          .filter((set) => !draftUuids.value.includes(set.uuid))
          .map((set) => ({ ...set, containers: set.containers.map(serialize) })),
        activeUuid: candidate.uuid,
        modulePreferences: JSON.parse(JSON.stringify(modulePreferences.value)) as Record<
          string,
          ModulePreference
        >,
      };
      const write = writes.then(() => persistLibrary(snapshot));
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
    // Retrieving user data is always possible, even when business outputs are not ready.
    if (format === 'json') return exportJson(config.value);
    const check = getOutputCheck();
    validate(check);
    return format === 'arxml'
      ? exportArxml(config.value, module.value, check)
      : exportCsv(config.value, module.value, check);
  }

  return {
    getOutputCheck,
    quarantinedSets,
    dataSafety,
    recoveryWarning,
    draftUuids,
    assertWritable,
    exportRawLibrary,
    deleteRecoverySnapshot,
    openQuarantinedReadOnly,
    selectChoice,
    confirmRequiredDefaults,
    importModuleDefinitions,
    referenceAddOptions,
    createReferenceTarget,
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
    containerActionsFor,
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
