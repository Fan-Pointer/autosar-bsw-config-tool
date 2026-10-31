import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export enum DemEventSignificance {
  FAULT = 'DEM_EVENT_SIGNIFICANCE_FAULT',
  OCCURRENCE = 'DEM_EVENT_SIGNIFICANCE_OCCURRENCE',
}

export enum DemMemoryDestination {
  PRIMARY = 'DemPrimaryMemory',
  MIRROR = 'DemMirrorMemory',
  USER_DEFINED = 'DemUserDefinedMemory',
}

export interface DemDTCAttributes extends EcucElement {
  demAgingAllowed: boolean;
  demAgingCycleCounterThreshold?: number;
  demAgingCycleCounterThresholdForTFSLC?: number;
  demAgingCycleRef?: UUID;

  demDTCPriority: number;
  demDTCSignificance: DemEventSignificance;
  demImmediateNvStorage: boolean;
  demMemoryDestinationRef: DemMemoryDestination[];

  demFreezeFrameClassRef?: UUID;
  demFreezeFrameRecNumClassRef?: UUID;
  demMaxNumberFreezeFrameRecords?: number;
  demEventMemoryEntryFdcThresholdStorageValue?: number;

  demExtendedDataClassRef?: UUID;

  demWWHOBDFreezeFrameClassRef?: UUID;
  demJ1939FreezeFrameClassRef?: UUID;
  demJ1939ExpandedFreezeFrameClassRef?: UUID;
}

export const DemDTCAttributesDependencies = [
  {
    parent: 'demAgingAllowed',
    condition: { operator: 'eq', value: true },
    children: [
      'demAgingCycleCounterThreshold',
      'demAgingCycleCounterThresholdForTFSLC',
      'demAgingCycleRef',
    ],
    behavior: 'enable' as const,
  },
  {
    parent: 'demFreezeFrameRecNumClassRef',
    condition: { operator: 'exists', value: true },
    children: ['demMaxNumberFreezeFrameRecords'],
    behavior: 'enable' as const,
  },
];

/**
 * Create a legacy DemDTCAttributes value.
 * @param shortName Initial shortName value.
 * @returns The initialized DemDTCAttributes value.
 */
export function createDemDTCAttributes(shortName: string): DemDTCAttributes {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demAgingAllowed: false,
    demDTCPriority: 128,
    demDTCSignificance: DemEventSignificance.FAULT,
    demImmediateNvStorage: false,
    demMemoryDestinationRef: [],
  };
}
