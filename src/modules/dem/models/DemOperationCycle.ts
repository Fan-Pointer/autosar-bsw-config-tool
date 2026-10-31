import type { EcucElement } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export enum DemOperationCycleType {
  IGNITION = 'DEM_OPCYC_IGNITION',
  OBD_DCY = 'DEM_OPCYC_OBD_DCY',
  WARMUP = 'DEM_OPCYC_WARMUP',
  POWER = 'DEM_OPCYC_POWER'
}

export interface DemOperationCycle extends EcucElement {
  demOperationCycleType: DemOperationCycleType | string;
}

export function createDemOperationCycle(
  shortName: string,
  type: DemOperationCycleType
): DemOperationCycle {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demOperationCycleType: type
  };
}
