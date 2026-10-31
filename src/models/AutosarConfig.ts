import type { UUID } from '@/types/base';

export interface AutosarConfig {
  version: string;
  metadata: {
    createdAt: number;
    lastModified: number;
    toolVersion: string;
    autosarVersion: string;
  };

  dem: {
    configSets: DemConfigSet[];
  };
}

export function createAutosarConfig(): AutosarConfig {
  const now = Date.now();
  return {
    version: '1.0.0',
    metadata: {
      createdAt: now,
      lastModified: now,
      toolVersion: '0.1.0',
      autosarVersion: '4.2.2'
    },
    dem: {
      configSets: []
    }
  };
}
