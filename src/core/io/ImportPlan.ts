import type { BswmdContainer, BswmdModule } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { generateUUID } from '@/utils/uuid';
import { hydrateConfig, serializeConfig } from './ConfigJson';
import type { ConflictStrategy, ImportConflict, ImportPlan } from './IoTypes';

function display(value: unknown): string {
  return value === undefined ? '（未提供 / 未启用）' : String(value);
}

/** Build the same immutable candidate used for both preview and application.
 * @param current Target configuration, or null to restore into a new set.
 * @param incoming Independently parsed file configuration.
 * @param module Loaded module definition.
 * @param strategy Policy for containers with conflicting fields.
 * @returns Detached result and counts; current and incoming remain unchanged on success or failure.
 */
export function planImport(
  current: ConfigInstance | null,
  incoming: ConfigInstance,
  module: BswmdModule,
  strategy: ConflictStrategy = 'overwrite'
): ImportPlan {
  const source = hydrateConfig(serializeConfig(incoming), [module]);
  const result = current
    ? hydrateConfig(serializeConfig(current), [module])
    : { ...source, containers: [] };
  const oldEntries = collectContainers(result, module);
  const sourceEntries = collectContainers(source, module);
  const oldByPath = new Map(oldEntries.map((entry) => [entry.path, entry]));
  const sourcePaths = new Map(sourceEntries.map((entry) => [entry.container.uuid, entry.path]));
  const oldPaths = new Map(oldEntries.map((entry) => [entry.container.uuid, entry.path]));
  const conflicts: ImportConflict[] = [];
  const conflictingPaths = new Set<string>();
  for (const entry of sourceEntries) {
    const old = oldByPath.get(entry.path);
    if (!old) continue;
    if (old.container.definitionRef !== entry.container.definitionRef)
      throw new Error(`${entry.path}：同路径容器的定义不同，请先重命名实例`);
    const before = conflicts.length;
    const params = new Set([
      ...entry.container.parameters.keys(),
      ...old.container.parameters.keys(),
    ]);
    for (const id of params) {
      const file = entry.container.parameters.get(id),
        project = old.container.parameters.get(id);
      if (!file || !project || file.value !== project.value) {
        if (!project) continue; // A previously absent field is an addition, not a conflict.
        conflicts.push({
          path: entry.path,
          parameter: entry.definition.parameters.find((p) => p.uuid === id)!.shortName,
          fileValue: display(file?.value),
          projectValue: display(project.value),
        });
      }
    }
    const refs = new Set([
      ...entry.container.references.keys(),
      ...old.container.references.keys(),
    ]);
    for (const id of refs) {
      const file = entry.container.references.get(id),
        project = old.container.references.get(id);
      const filePath = file ? (sourcePaths.get(file.targetUuid) ?? file.targetUuid) : undefined;
      const projectPath = project
        ? (oldPaths.get(project.targetUuid) ?? project.targetUuid)
        : undefined;
      if (project && (!file || filePath !== projectPath))
        conflicts.push({
          path: entry.path,
          parameter: entry.definition.references.find((r) => r.uuid === id)!.shortName,
          fileValue: display(filePath || undefined),
          projectValue: display(projectPath || undefined),
        });
    }
    if (conflicts.length !== before) conflictingPaths.add(entry.path);
  }
  const occupied = new Set([result.uuid, ...oldEntries.map((entry) => entry.container.uuid)]);
  const identities = new Map<string, string>();
  // Pre-map every matching path, including skipped subtrees that other imported instances may reference.
  for (const entry of sourceEntries) {
    const old = oldByPath.get(entry.path);
    if (old) identities.set(entry.container.uuid, old.container.uuid);
  }
  const copied: ConfigContainer[] = [];
  const copyTree = (item: ConfigContainer, fresh: boolean): ConfigContainer => {
    let uuid = item.uuid;
    if (fresh || occupied.has(uuid)) uuid = generateUUID();
    occupied.add(uuid);
    identities.set(item.uuid, uuid);
    const copy = {
      ...item,
      uuid,
      subContainers: item.subContainers.map((child) => copyTree(child, fresh)),
    };
    copied.push(copy);
    return copy;
  };
  const merge = (target: ConfigContainer[], items: ConfigContainer[], parent: string): void => {
    for (const item of items) {
      const path = parent ? `${parent}/${item.shortName}` : item.shortName;
      const old = target.find((child) => child.shortName === item.shortName);
      if (!old) {
        target.push(copyTree(item, false));
        continue;
      }
      if (conflictingPaths.has(path) && strategy === 'skip') continue;
      if (conflictingPaths.has(path) && strategy === 'rename') {
        const clone = copyTree(item, true);
        let name = `${item.shortName}_2`;
        for (
          let suffix = 3;
          target.some((child) => child.shortName === name) ||
          items.some((child) => child.shortName === name);
          suffix++
        )
          name = `${item.shortName}_${suffix}`;
        clone.shortName = name;
        target.push(clone);
        continue;
      }
      identities.set(item.uuid, old.uuid);
      old.parameters = item.parameters;
      old.references = item.references;
      old.description = item.description;
      copied.push(old);
      merge(old.subContainers, item.subContainers, path);
    }
  };
  merge(result.containers, source.containers, '');
  // Only references originating in the file are remapped; existing project references keep their targets.
  for (const container of copied)
    for (const ref of container.references.values())
      ref.targetUuid = identities.get(ref.targetUuid) ?? ref.targetUuid;
  const bounds = (children: ConfigContainer[], defs: BswmdContainer[]): void => {
    for (const def of defs) {
      const matching = children.filter((child) => child.definitionRef === def.uuid);
      if (def.multiplicity.upper !== 'unbounded' && matching.length > def.multiplicity.upper)
        throw new Error(
          `${def.shortName}：导入结果超过实例上限 ${def.multiplicity.upper}，请调整冲突策略`
        );
      for (const child of matching) bounds(child.subContainers, def.subContainers);
    }
  };
  bounds(result.containers, module.containers);
  const afterEntries = collectContainers(result, module);
  const oldIds = new Map(oldEntries.map((entry) => [entry.container.uuid, entry.container]));
  // oldEntries share the candidate's containers, so derive deletion/addition counts from the untouched target instead.
  if (current)
    for (const entry of collectContainers(current, module))
      oldIds.set(entry.container.uuid, entry.container);
  const afterIds = new Map(afterEntries.map((entry) => [entry.container.uuid, entry.container]));
  let addedContainers = 0,
    addedParameters = 0,
    deletedItems = 0;
  for (const { container } of afterEntries) {
    const old = oldIds.get(container.uuid);
    if (!old) addedContainers++;
    for (const id of container.parameters.keys()) if (!old?.parameters.has(id)) addedParameters++;
  }
  for (const old of oldIds.values()) {
    const after = afterIds.get(old.uuid);
    if (!after) deletedItems++;
    for (const id of old.parameters.keys()) if (!after?.parameters.has(id)) deletedItems++;
    for (const id of old.references.keys()) if (!after?.references.has(id)) deletedItems++;
  }
  return { result, conflicts, addedContainers, addedParameters, deletedItems };
}
