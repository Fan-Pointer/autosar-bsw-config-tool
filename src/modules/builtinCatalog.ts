import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import { BswmdLoader } from '@/core/bswmd/BswmdLoader';
import catalog440 from '../../bswmd/builtin/4.4.0/catalog.json';
import catalog422 from '../../bswmd/builtin/4.2.2/catalog.json';

export interface BuiltinModuleEntry {
  shortName: string;
  release: string;
  group: string;
  asset: string | null;
  contentSha256: string | null;
  status: 'available' | 'limited' | 'unsupported';
  parsed: boolean;
  reason: string;
  batch: string | null;
  diagnostics: string[];
}

/** Generated catalog, including modules whose definitions or qualification are still pending. */
export const builtinCatalog: readonly BuiltinModuleEntry[] = [
  ...catalog440.entries,
  ...catalog422.entries,
] as BuiltinModuleEntry[];

const assets = import.meta.glob('../../bswmd/builtin/*/*_bswmd.json', {
  query: '?raw',
  import: 'default',
});

/** Read qualified definitions for one release without changing the configuration library.
 * @param names Selected module names. @param version AUTOSAR release. @returns Definitions.
 */
export async function readBuiltinModules(names: string[], version: string): Promise<BswmdModule[]> {
  return Promise.all(
    names.map(async (name) => {
      const entry = builtinCatalog.find(
        (item) => item.shortName === name && item.release === version
      );
      if (!entry || entry.status === 'unsupported' || !entry.asset)
        throw new Error(`${name} (${version})：${entry?.reason ?? '定义尚未接入'}`);
      const read = assets[`../../bswmd/builtin/${version}/${entry.asset}`];
      if (!read) throw new Error(`${name} (${version}) 的定义资源缺失`);
      const raw = await read();
      if (typeof raw !== 'string') throw new Error(`${name} 的定义资源无效`);
      const definition = new BswmdLoader().loadFromString(raw);
      if (
        definition.shortName !== name ||
        definition.version !== version ||
        definition.$source?.contentSha256 !== entry.contentSha256
      )
        throw new Error(`${name} 的定义版本/哈希与目录不一致`);
      return definition;
    })
  );
}
