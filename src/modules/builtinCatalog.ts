import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import { BswmdLoader } from '@/core/bswmd/BswmdLoader';

/** Shipped definitions; catalog metadata is small and definitions load only when selected. */
export const builtinCatalog = [
  {
    shortName: 'Dem',
    version: '4.4.0',
    group: '诊断服务',
    read: () => import('../../bswmd/dem_bswmd.json?raw'),
  },
  {
    shortName: 'CanIf',
    version: '4.4.0',
    group: '通信服务',
    read: () => import('../../bswmd/builtin/4.4.0/canif_bswmd.json?raw'),
  },
  {
    shortName: 'NvM',
    version: '4.4.0',
    group: '存储服务',
    read: () => import('../../bswmd/builtin/4.4.0/nvm_bswmd.json?raw'),
  },
];

/** Read matching shipped assets without changing the user's configuration library.
 * @param names Selected module names. @param version AUTOSAR release. @returns Definitions.
 */
export async function readBuiltinModules(names: string[], version: string): Promise<BswmdModule[]> {
  return Promise.all(
    names.map(async (name) => {
      const entry = builtinCatalog.find(
        (item) => item.shortName === name && item.version === version
      );
      if (!entry) throw new Error(`${name} (${version}) 的内置定义尚未接入`);
      const definition = new BswmdLoader().loadFromString((await entry.read()).default);
      if (definition.shortName !== name || definition.version !== version)
        throw new Error(`${name} 的定义版本与目录不一致`);
      return definition;
    })
  );
}
