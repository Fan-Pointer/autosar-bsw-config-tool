import type { BswmdModule } from '../bswmd/BswmdTypes';
import type { ConfigInstance } from '../config/ConfigTypes';
import { collectContainers } from '../config/ConfigTraversal';

export interface SearchResult {
  setUuid: string;
  setName: string;
  containerUuid: string;
  fieldUuid?: string;
  path: string;
  name: string;
  value: string;
}

/** Build a definition-driven index once per configuration change.
 * @param sets All local configurations. @param modules Loaded definitions.
 * @returns Searchable rows for paths, parameter names/values and references.
 */
export function buildSearchIndex(sets: ConfigInstance[], modules: BswmdModule[]): SearchResult[] {
  return sets.flatMap((set) => {
    const module = modules.find(
      (item) => item.shortName === set.moduleRef && item.version === set.version
    );
    if (!module) return [];
    return collectContainers(set, module).flatMap((entry) => {
      const base = {
        setUuid: set.uuid,
        setName: set.name ?? set.moduleRef,
        containerUuid: entry.container.uuid,
        path: entry.path,
      };
      return [
        { ...base, name: entry.container.shortName, value: '' },
        ...entry.definition.parameters.map((p) => ({
          ...base,
          fieldUuid: p.uuid,
          name: p.shortName,
          value: String(entry.container.parameters.get(p.uuid)?.value ?? ''),
        })),
        ...entry.definition.references.map((r) => ({
          ...base,
          fieldUuid: r.uuid,
          name: r.shortName,
          value: entry.container.references.get(r.uuid)?.targetUuid ?? '',
        })),
      ];
    });
  });
}

/** @param index Cached rows. @param query Literal, case-insensitive query. @returns All matching rows. */
export function searchConfigurations(index: SearchResult[], query: string): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  return needle
    ? index.filter((row) =>
        [row.path, row.name, row.value].some((value) => value.toLocaleLowerCase().includes(needle))
      )
    : [];
}
