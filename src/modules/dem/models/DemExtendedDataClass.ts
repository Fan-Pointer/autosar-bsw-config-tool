import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export interface DemExtendedDataClass extends EcucElement {
  demExtendedDataRecordClasses: DemExtendedDataRecordClass[];
}

export interface DemExtendedDataRecordClass {
  uuid: UUID;
  shortName: string;
  demExtendedDataRecordNumber: number;
  demExtendedDataRecordTrigger: string;
  demExtendedDataRecordUpdate: string;
  demDataElementClassRef?: UUID;
}

export function createDemExtendedDataClass(shortName: string): DemExtendedDataClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demExtendedDataRecordClasses: []
  };
}
