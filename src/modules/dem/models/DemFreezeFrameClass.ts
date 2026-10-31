import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export interface DemFreezeFrameClass extends EcucElement {
  demPidClasses: DemPidClass[];
}

export interface DemPidClass {
  uuid: UUID;
  shortName: string;
  dataSource: 'CS' | 'SR' | 'Internal';
}

/**
 * Create a legacy DemFreezeFrameClass value.
 * @param shortName Initial shortName value.
 * @returns The initialized DemFreezeFrameClass value.
 */
export function createDemFreezeFrameClass(shortName: string): DemFreezeFrameClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demPidClasses: [],
  };
}
