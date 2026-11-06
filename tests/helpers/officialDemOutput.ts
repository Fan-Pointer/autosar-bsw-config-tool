import type { BswmdModule } from '../../src/core/bswmd/BswmdTypes';
import type { ConfigInstance } from '../../src/core/config/ConfigTypes';
import { ConfigInstanceManager } from '../../src/core/config/ConfigInstance';
import { collectContainers } from '../../src/core/config/ConfigTraversal';

/** Explicitly select the already-present official internal targets required by the test sample.
 * @param config Official Dem sample. @param module Unmodified official definition.
 * @returns Nothing; missing or external targets fail the fixture rather than fabricate a target.
 */
export function confirmOfficialRequiredReferences(
  config: ConfigInstance,
  module: BswmdModule
): void {
  const manager = new ConfigInstanceManager([module]);
  const entries = collectContainers(config, module);
  for (const entry of entries)
    for (const reference of entry.definition.references.filter((r) => !r.isOptional)) {
      const target = entries.find(
        (candidate) => candidate.definition.shortName === reference.destinationContainerType
      );
      if (!target || reference.isExternal)
        throw new Error(`Official fixture has no supported target for ${reference.shortName}`);
      manager.setReferenceTarget(entry.container, reference.uuid, target.container.uuid);
    }
}
