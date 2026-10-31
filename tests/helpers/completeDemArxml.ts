import type { BswmdModule } from '../../src/core/bswmd/BswmdTypes';
import type { ConfigInstance } from '../../src/core/config/ConfigTypes';
import { ConfigInstanceManager } from '../../src/core/config/ConfigInstance';
import { collectContainers } from '../../src/core/config/ConfigTraversal';

/** Explicitly configure required DEM fixture values before value-file/security/UI tests.
 * @param config Test configuration with a DTC and root.
 * @param module Loaded DEM definition.
 * @returns Nothing; preserves selection and the tests' original assertions.
 */
export function completeDemArxml(config: ConfigInstance, module: BswmdModule): void {
  const manager = new ConfigInstanceManager([module]);
  const root = config.containers[0];
  const attributes =
    root.subContainers.find((c) => c.definitionRef === 'ecuc-dem-dtc-attributes-def') ??
    manager.addContainerInstance(config, root.uuid, 'ecuc-dem-dtc-attributes-def');
  for (const { container, definition } of collectContainers(config, module)) {
    for (const parameter of definition.parameters.filter((p) => !p.isOptional))
      manager.setParameterValue(
        container,
        parameter.uuid,
        container.parameters.get(parameter.uuid)!.value
      );
    if (container.definitionRef === 'ecuc-dem-dtc-def')
      manager.setReferenceTarget(container, 'ecuc-dem-dtc-attributes-ref', attributes.uuid);
  }
}
