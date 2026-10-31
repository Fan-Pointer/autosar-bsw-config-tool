import type { BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigInstance } from '../config/ConfigTypes';
import {
  collectContainers,
  indexDefinitions,
  type ContainerEntry,
} from '../config/ConfigTraversal';

function value(entry: ContainerEntry, role: BswmdParameter['exportRole']): unknown {
  const field = entry.definition.parameters.find((parameter) => parameter.exportRole === role);
  return field ? entry.container.parameters.get(field.uuid)?.value : undefined;
}
function cell(value: unknown): string {
  let text = value === undefined ? '' : String(value);
  // Quote separators/newlines and keep spreadsheet applications from executing text as formulas.
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Project DTC rows using semantic roles authored in BSWMD, never instance names.
 * @param config Configuration to export.
 * @param module Module definitions with CSV role metadata.
 * @returns UTF-8 BOM-prefixed CSV; one row per DTC, multiple EventIds joined by semicolons.
 */
export function exportCsv(config: ConfigInstance, module: BswmdModule): string {
  if (
    ![...indexDefinitions(module).values()].some((def) =>
      def.parameters.some((p) => p.exportRole === 'dtcValue')
    )
  )
    throw new Error('此模块未定义 DTC CSV 导出字段');
  const entries = collectContainers(config, module);
  const byId = new Map(entries.map((entry) => [entry.container.uuid, entry]));
  const events = new Map<string, string[]>();
  for (const entry of entries) {
    const eventId = value(entry, 'eventId');
    if (eventId === undefined) continue;
    for (const def of entry.definition.references.filter((ref) => ref.exportRole === 'dtc')) {
      const target = entry.container.references.get(def.uuid)?.targetUuid;
      if (target) events.set(target, [...(events.get(target) ?? []), String(eventId)]);
    }
  }
  const rows: unknown[][] = [
    ['DtcValue(hex)', 'Severity', 'WWH-OBD Class', 'Attributes 名', 'EventId'],
  ];
  for (const entry of entries.filter((item) =>
    item.definition.parameters.some((p) => p.exportRole === 'dtcValue')
  )) {
    const number = value(entry, 'dtcValue');
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 0xffffff)
      throw new Error(`${entry.path}：DTC 值须为 0x000000 至 0xFFFFFF`);
    const ref = entry.definition.references.find((item) => item.exportRole === 'attributes');
    const target = ref ? entry.container.references.get(ref.uuid)?.targetUuid : undefined;
    rows.push([
      `0x${number.toString(16).toUpperCase().padStart(6, '0')}`,
      value(entry, 'severity'),
      value(entry, 'wwhObdClass'),
      target ? (byId.get(target)?.container.shortName ?? target) : '',
      (events.get(entry.container.uuid) ?? []).join(';'),
    ]);
  }
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
