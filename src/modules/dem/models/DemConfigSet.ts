import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

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
    demOperationCycles: []
  };
}
