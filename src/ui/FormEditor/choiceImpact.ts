import type { ContainerEntry } from '@/core/config/ConfigTraversal';

/** Describe configured fields removed by replacing a choice, and inbound links that will dangle.
 * @param entries Current store traversal. @param groupUuid Choice instance UUID.
 * @returns Presentation rows only; the core remains responsible for switching semantics.
 */
export function choiceImpact(entries: ContainerEntry[], groupUuid: string) {
  const group = entries.find((entry) => entry.container.uuid === groupUuid);
  if (!group) return [];
  const affected = entries.filter((entry) => entry.path.startsWith(group.path + '/'));
  const ids = new Set(affected.map((entry) => entry.container.uuid));
  const pathById = new Map(entries.map((entry) => [entry.container.uuid, entry.path]));
  const rows: { path: string; value: string; effect: string }[] = [];
  for (const entry of affected) {
    for (const parameter of entry.definition.parameters) {
      const value = entry.container.parameters.get(parameter.uuid);
      if (value?.isConfigured)
        rows.push({
          path: `${entry.path}/${parameter.shortName}`,
          value: value.value === undefined ? '未设置值' : String(value.value),
          effect: '移除已配值',
        });
    }
    for (const reference of entry.definition.references) {
      const value = entry.container.references.get(reference.uuid);
      if (value?.isConfigured)
        rows.push({
          path: `${entry.path}/${reference.shortName}`,
          value: (pathById.get(value.targetUuid) ?? value.targetUuid) || '未选择目标',
          effect: '移除引用',
        });
    }
  }
  for (const entry of entries.filter((item) => !ids.has(item.container.uuid)))
    for (const reference of entry.definition.references) {
      const value = entry.container.references.get(reference.uuid);
      if (value?.isConfigured && ids.has(value.targetUuid))
        rows.push({
          path: `${entry.path}/${reference.shortName}`,
          value: pathById.get(value.targetUuid) ?? value.targetUuid,
          effect: '保留引用，但目标将失效',
        });
    }
  return rows;
}
