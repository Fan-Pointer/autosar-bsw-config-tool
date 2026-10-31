import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export enum DemDTCSeverity {
  NO_SEVERITY = 'DEM_SEVERITY_NO_SEVERITY',
  CHECK_IMMEDIATELY = 'DEM_SEVERITY_CHECK_IMMEDIATELY',
  CHECK_AT_NEXT_HALT = 'DEM_SEVERITY_CHECK_AT_NEXT_HALT',
  MAINTENANCE_ONLY = 'DEM_SEVERITY_MAINTENANCE_ONLY'
}

export enum DemWWHOBDDTCClass {
  NOCLASS = 'DEM_DTC_WWHOBD_CLASS_NOCLASS',
  CLASS_A = 'DEM_DTC_WWHOBD_CLASS_A',
  CLASS_B1 = 'DEM_DTC_WWHOBD_CLASS_B1',
  CLASS_B2 = 'DEM_DTC_WWHOBD_CLASS_B2',
  CLASS_C = 'DEM_DTC_WWHOBD_CLASS_C'
}

export interface DemDTC extends EcucElement {
  demDtcValue: number;
  demDTCFunctionalUnit?: number;
  demDTCSeverity: DemDTCSeverity;
  demWWHOBDDTCClass?: DemWWHOBDDTCClass;
  demDTCAttributesRef: UUID;
  demObdDTCRef?: UUID;
  demJ1939DTC_J1939NodeRef?: UUID;
}

export const DemDTCValidationRules = {
  demDtcValue: {
    min: 0x000001,
    max: 0xFFFFFF,
    reserved: [0x000000]
  },
  demDTCFunctionalUnit: {
    min: 0,
    max: 255
  }
};

export function createDemDTC(shortName: string): DemDTC {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDtcValue: 0x000001,
    demDTCSeverity: DemDTCSeverity.NO_SEVERITY,
    demDTCAttributesRef: '' as UUID
  };
}
