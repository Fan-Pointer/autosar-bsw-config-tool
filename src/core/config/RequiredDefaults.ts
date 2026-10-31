import type { BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from './ConfigTypes';
import { collectContainers } from './ConfigTraversal';

/** Plan explicit confirmation without overwriting edits or inventing absent defaults.
 * @param config Active configuration; only existing instances are considered.
 * @param module Loaded definition metadata.
 * @returns Writable default assignments and the number of parameters still needing manual input.
 */
export function planRequiredDefaults(
  config: ConfigInstance,
  module: BswmdModule
): {
  assignments: { container: ConfigContainer; definition: BswmdParameter }[];
  remaining: number;
} {
  const assignments: { container: ConfigContainer; definition: BswmdParameter }[] = [];
  let remaining = 0;
  for (const { container, definition } of collectContainers(config, module)) {
    for (const parameter of definition.parameters) {
      const value = container.parameters.get(parameter.uuid);
      if (parameter.isOptional || (value?.isConfigured && value.value !== undefined)) continue;
      // Fallback editor values (0/false/empty text) are not evidence of DEFAULT-VALUE.
      if (parameter.defaultValue !== undefined && !parameter.readOnly)
        assignments.push({ container, definition: parameter });
      else remaining++;
    }
  }
  return { assignments, remaining };
}
