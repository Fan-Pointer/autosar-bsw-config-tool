import type { BswmdContainer, BswmdModule, BswmdReference } from '../bswmd/BswmdTypes';
import type { ConfigInstance } from './ConfigTypes';
import { collectContainers, type ContainerEntry } from './ConfigTraversal';

/** Match every declared local destination, retaining short-name compatibility for old definitions.
 * @param reference Reference definition. @param target Candidate container definition.
 * @returns Whether this local definition is an allowed target; external references never match.
 */
export function matchesReferenceDefinition(
  reference: BswmdReference,
  target: BswmdContainer
): boolean {
  if (reference.isExternal) return false;
  const paths = reference.destinationRefs?.length
    ? reference.destinationRefs
    : reference.destinationRef
      ? [reference.destinationRef]
      : [];
  return paths.length > 0
    ? Boolean(target.definitionPath && paths.includes(target.definitionPath))
    : target.shortName === reference.destinationContainerType;
}

/** Resolve all local candidates through definition identity, not instance display names.
 * @param reference Reference definition. @param config Current configuration only.
 * @param module Bound module definition. @returns Matching instances in tree order.
 */
export function resolveReferenceCandidates(
  reference: BswmdReference,
  config: ConfigInstance,
  module: BswmdModule
): ContainerEntry[] {
  if (config.moduleRef !== module.shortName || config.version !== module.version)
    throw new Error('Reference candidates require the configuration’s exact module version');
  return collectContainers(config, module).filter((entry) =>
    matchesReferenceDefinition(reference, entry.definition)
  );
}

/** Map ECUC definition kinds to their standard DEFINITION-REF DEST value.
 * @param reference Reference definition. @returns AUTOSAR CP 4.4.0 definition class name.
 */
export function referenceDefinitionDest(reference: BswmdReference): string {
  return {
    reference: 'ECUC-REFERENCE-DEF',
    choice: 'ECUC-CHOICE-REFERENCE-DEF',
    foreign: 'ECUC-FOREIGN-REFERENCE-DEF',
    instance: 'ECUC-INSTANCE-REFERENCE-DEF',
    symbolic: 'ECUC-SYMBOLIC-NAME-REFERENCE-DEF',
  }[reference.kind ?? 'reference'];
}
