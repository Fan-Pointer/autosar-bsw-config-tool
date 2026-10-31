import type { ConfigContainer, ConfigInstance } from './ConfigTypes';
import { generateUUID } from '@/utils/uuid';

function copyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
}

/**
 * Copy an entire forest with new identities and references confined to the copy.
 * @param containers Source roots (a whole set or a single subtree).
 * @returns Independent roots; targets outside this forest are cleared for re-selection.
 */
export function cloneContainers(containers: ConfigContainer[]): ConfigContainer[] {
  const identities = new Map<string, string>();
  const copy = (source: ConfigContainer): ConfigContainer => {
    const uuid = generateUUID();
    identities.set(source.uuid, uuid);
    return {
      ...source,
      uuid,
      parameters: new Map(
        [...source.parameters].map(([id, value]) => [
          id,
          { ...value, value: copyValue(value.value) },
        ])
      ),
      references: new Map([...source.references].map(([id, value]) => [id, { ...value }])),
      subContainers: source.subContainers.map(copy),
    };
  };
  const roots = containers.map(copy);
  const remap = (container: ConfigContainer): void => {
    // A second pass also resolves forward references and cycles between sibling subtrees.
    for (const reference of container.references.values()) {
      reference.targetUuid = identities.get(reference.targetUuid) ?? '';
      if (!reference.targetUuid) reference.isConfigured = false;
    }
    container.subContainers.forEach(remap);
  };
  roots.forEach(remap);
  return roots;
}

/**
 * Clone a named configuration without retaining references to its source set.
 * @param source Configuration to copy.
 * @param name Display name of the copy.
 * @returns Independent configuration with fresh timestamps and UUIDs.
 */
export function cloneConfiguration(source: ConfigInstance, name: string): ConfigInstance {
  const now = Date.now();
  return {
    ...source,
    uuid: generateUUID(),
    name,
    createdAt: now,
    lastModified: now,
    containers: cloneContainers(source.containers),
  };
}
