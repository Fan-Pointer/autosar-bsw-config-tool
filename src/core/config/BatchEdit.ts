import type { BswmdParameter } from '../bswmd/BswmdTypes';
import type { ContainerEntry } from './ConfigTraversal';

/** @param entries Selected instances. @returns Definition UUID intersection, in definition order. */
export function commonParameters(entries: ContainerEntry[]): BswmdParameter[] {
  return (
    entries[0]?.definition.parameters.filter((parameter) =>
      entries.every((entry) =>
        entry.definition.parameters.some((candidate) => candidate.uuid === parameter.uuid)
      )
    ) ?? []
  );
}

/** @param entry Selected instance. @param definition Parameter metadata.
 * @param value Proposed value. @returns Skip reason, or undefined when writable.
 */
export function batchSkipReason(
  entry: ContainerEntry,
  definition: BswmdParameter,
  value: unknown
): string | undefined {
  const parameter = entry.container.parameters.get(definition.uuid);
  if (definition.readOnly) return '只读';
  if (definition.isOptional && parameter?.value === undefined) return '已禁用';
  if (!parameter) return '参数不存在';
  const valid =
    definition.type === 'BOOLEAN'
      ? typeof value === 'boolean'
      : definition.type === 'INTEGER'
        ? typeof value === 'number' && Number.isSafeInteger(value)
        : definition.type === 'FLOAT'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === 'string';
  if (!valid) return '类型不符';
  if (
    typeof value === 'number' &&
    ((definition.min !== undefined && value < definition.min) ||
      (definition.max !== undefined && value > definition.max))
  )
    return '超出范围';
  if (definition.type === 'ENUM' && !definition.enumValues?.includes(String(value)))
    return '不在枚举选项中';
  return undefined;
}
