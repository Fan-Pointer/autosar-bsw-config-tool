import type { ConfigInstance, ConfigContainer } from '../config/ConfigTypes';
import type { SerializedConfig, SerializedContainer } from '../io/IoTypes';
import { serializeConfig } from '../io/ConfigJson';

type Path = (string | number)[];
type Change = { path: Path; before: unknown; after: unknown; start?: number };

/** Internal trusted snapshots may contain unfinished/invalid edits, so replay must not use IO validation. */
function restore(snapshot: SerializedConfig): ConfigInstance {
  const visit = (item: SerializedContainer): ConfigContainer => ({
    ...item,
    parameters: new Map(item.parameters.map((p) => [p.definitionRef, { ...p }])),
    references: new Map(item.references.map((r) => [r.definitionRef, { ...r }])),
    subContainers: item.subContainers.map(visit),
  });
  return { ...snapshot, containers: snapshot.containers.map(visit) };
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function diff(before: unknown, after: unknown, path: Path, changes: Change[]): void {
  if (Object.is(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    before.forEach((value, i) => diff(value, after[i], [...path, i], changes));
  } else if (Array.isArray(before) && Array.isArray(after)) {
    let start = 0,
      end = 0;
    const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
    while (start < Math.min(before.length, after.length) && equal(before[start], after[start]))
      start++;
    while (
      end < Math.min(before.length, after.length) - start &&
      equal(before[before.length - 1 - end], after[after.length - 1 - end])
    )
      end++;
    // Retain just the inserted/deleted run, rather than the surrounding forest.
    changes.push({
      path,
      start,
      before: before.slice(start, before.length - end),
      after: after.slice(start, after.length - end),
    });
  } else if (object(before) && object(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
      diff(before[key], after[key], [...path, key], changes);
  } else {
    changes.push({ path, before, after });
  }
}
function child(value: unknown, key: string | number): unknown {
  return Array.isArray(value) ? value[Number(key)] : object(value) ? value[key] : undefined;
}

/** Compute reversible field/subtree differences from transient snapshots.
 * @param before State before one edit.
 * @param after State after one edit.
 * @returns Replay function retaining only differences, not the original snapshots.
 */
export function configurationDelta(
  before: SerializedConfig,
  after: SerializedConfig
): (current: ConfigInstance, forward: boolean) => ConfigInstance {
  const changes: Change[] = [];
  diff(before, after, [], changes);
  return (current, forward) => {
    const snapshot = serializeConfig(current);
    for (const change of changes) {
      if (change.start !== undefined) {
        let list: unknown = snapshot;
        for (const key of change.path) list = child(list, key);
        const insert = forward ? change.after : change.before;
        const remove = forward ? change.before : change.after;
        if (Array.isArray(list) && Array.isArray(insert) && Array.isArray(remove))
          list.splice(change.start, remove.length, ...insert);
        continue;
      }
      let parent: unknown = snapshot;
      for (const key of change.path.slice(0, -1)) parent = child(parent, key);
      const key = change.path[change.path.length - 1];
      const value = forward ? change.after : change.before;
      if (Array.isArray(parent)) parent[Number(key)] = value;
      else if (object(parent)) parent[key] = value;
    }
    return restore(snapshot);
  };
}
