import type { BswmdContainer, BswmdModule } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from './ConfigTypes';

/** A configuration container paired with its definition and human-readable path. */
export interface ContainerEntry {
  container: ConfigContainer;
  definition: BswmdContainer;
  path: string;
}

/**
 * Index definitions at every nesting level.
 * @param module Module definition.
 * @returns Definition UUID to container definition map.
 */
export function indexDefinitions(module: BswmdModule): Map<string, BswmdContainer> {
  const index = new Map<string, BswmdContainer>();
  const pending = [...module.containers];
  while (pending.length) {
    const definition = pending.pop();
    if (!definition) continue;
    index.set(definition.uuid, definition);
    pending.push(...definition.subContainers);
  }
  return index;
}

/**
 * Traverse all instances using definitionRef, independent of instance names.
 * @param config Configuration to traverse.
 * @param module Definitions to resolve.
 * @returns Instances and definitions in depth-first order.
 */
export function collectContainers(config: ConfigInstance, module: BswmdModule): ContainerEntry[] {
  const definitions = indexDefinitions(module);
  const entries: ContainerEntry[] = [];
  const visit = (containers: ConfigContainer[], parent: string): void => {
    for (const container of containers) {
      const path = parent ? `${parent}/${container.shortName}` : container.shortName;
      const definition = definitions.get(container.definitionRef);
      if (!definition) throw new Error(`${path}: unknown definitionRef ${container.definitionRef}`);
      entries.push({ container, definition, path });
      visit(container.subContainers, path);
    }
  };
  visit(config.containers, '');
  return entries;
}
