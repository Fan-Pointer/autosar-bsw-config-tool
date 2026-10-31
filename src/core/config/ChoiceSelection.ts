import type { BswmdContainer } from '../bswmd/BswmdTypes';
import type { ConfigContainer } from './ConfigTypes';

/** Check a choice instance at editing, import and export boundaries.
 * @param container Instance to check.
 * @param definition Matching definition, including candidate identities.
 * @param requireSelection Whether an unfinished empty choice must be rejected.
 * @returns A readable reason, or undefined for a valid selection/non-choice.
 */
export function choiceSelectionError(
  container: ConfigContainer,
  definition: BswmdContainer,
  requireSelection = false
): string | undefined {
  if (!definition.choice) return undefined;
  const children = container.subContainers;
  if (children.length > 1) return `${container.shortName}：CHOICE 只能选择一个候选`;
  if (!children.length)
    return requireSelection ? `${container.shortName}：CHOICE 尚未选择候选` : undefined;
  if (!definition.choice.candidateRefs.includes(children[0].definitionRef))
    return `${container.shortName}：CHOICE 候选定义不匹配`;
  if (
    definition.subContainers.find((child) => child.uuid === children[0].definitionRef)?.multiplicity
      .upper === 0
  )
    return `${container.shortName}：CHOICE 候选实例上限为 0`;
  return undefined;
}
