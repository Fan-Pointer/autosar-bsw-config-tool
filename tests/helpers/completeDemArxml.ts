import type { BswmdModule } from '../../src/core/bswmd/BswmdTypes';
import type { ConfigInstance } from '../../src/core/config/ConfigTypes';
import { ConfigInstanceManager } from '../../src/core/config/ConfigInstance';
import { collectContainers } from '../../src/core/config/ConfigTraversal';

/** Explicitly configure required synthetic Dem fixture values (not official AUTOSAR semantics) before value-file/security/UI tests.
 * @param config Test configuration with a DTC and root.
 * @param module Synthetic definition with TEST-SYNTHETIC-1 version.
 * @returns Nothing; preserves selection and the tests' original assertions.
 */
export function completeDemArxml(config: ConfigInstance, module: BswmdModule): void {
  const manager = new ConfigInstanceManager([module]);
  const root = config.containers[0];
  const attributes =
    root.subContainers.find((c) => c.definitionRef === 'fixture-dem-dtc-attributes-def') ??
    manager.addContainerInstance(config, root.uuid, 'fixture-dem-dtc-attributes-def');
  for (const { container, definition } of collectContainers(config, module)) {
    for (const parameter of definition.parameters.filter((p) => !p.isOptional))
      manager.setParameterValue(
        container,
        parameter.uuid,
        container.parameters.get(parameter.uuid)!.value
      );
    if (container.definitionRef === 'fixture-dem-dtc-def')
      manager.setReferenceTarget(container, 'fixture-dem-dtc-attributes-ref', attributes.uuid);
  }
}
