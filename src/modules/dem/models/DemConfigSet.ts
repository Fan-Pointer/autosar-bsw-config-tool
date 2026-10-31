import type { EcucElement } from '@/types/base';
import { generateUUID } from '@/utils/uuid';
import type { DemDTC } from './DemDTC';
import type { DemDTCAttributes } from './DemDTCAttributes';
import type { DemEventParameter } from './DemEventParameter';
import type { DemDebounceCounterBasedClass } from './DemDebounceCounterBasedClass';
import type { DemDebounceTimeBasedClass } from './DemDebounceTimeBasedClass';
import type { DemFreezeFrameClass } from './DemFreezeFrameClass';
import type { DemExtendedDataClass } from './DemExtendedDataClass';
import type { DemOperationCycle } from './DemOperationCycle';

export interface DemConfigSet extends EcucElement {
  version: string;
  lastModified: number;
  demDTCs: DemDTC[];
  demDTCAttributes: DemDTCAttributes[];
  demEventParameters: DemEventParameter[];
  demDebounceCounterBasedClasses: DemDebounceCounterBasedClass[];
  demDebounceTimeBasedClasses: DemDebounceTimeBasedClass[];
  demFreezeFrameClasses: DemFreezeFrameClass[];
  demExtendedDataClasses: DemExtendedDataClass[];
  demOperationCycles: DemOperationCycle[];
}

/**
 * Create a legacy DemConfigSet value.
 * @param shortName Initial shortName value.
 * @returns The initialized DemConfigSet value.
 */
export function createDemConfigSet(shortName: string): DemConfigSet {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    version: '1.0.0',
    lastModified: Date.now(),
    demDTCs: [],
    demDTCAttributes: [],
    demEventParameters: [],
    demDebounceCounterBasedClasses: [],
    demDebounceTimeBasedClasses: [],
    demFreezeFrameClasses: [],
    demExtendedDataClasses: [],
    demOperationCycles: [],
  };
}
