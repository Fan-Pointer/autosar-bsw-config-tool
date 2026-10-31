import type { EcucElement, UUID } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export enum DemEventKind {
  BSW = 'DEM_EVENT_KIND_BSW',
  SWC = 'DEM_EVENT_KIND_SWC',
}

export enum DemDebounceType {
  NONE = 'NONE',
  COUNTER_BASED = 'COUNTER_BASED',
  TIME_BASED = 'TIME_BASED',
  MONITOR_INTERNAL = 'MONITOR_INTERNAL',
}

export interface DemEventParameter extends EcucElement {
  demEventId: number;
  demEventKind: DemEventKind;
  demDTCRef?: UUID;
  demComponentClassRef?: UUID;
  demComponentPriority?: number;
  demEnableConditionGroupRef?: UUID;
  demEventAvailable: boolean;
  demEventFailureCycleCounterThreshold: number;
  demFFPrestorageSupported: boolean;
  demDebounceAlgorithm: {
    type: DemDebounceType;
    counterRef?: UUID;
    timeRef?: UUID;
  };
}

let eventIdCounter = 1;

/**
 * Allocate the next event ID for the legacy model factories.
 * @returns A sequential process-local event identifier.
 */
export function generateEventId(): number {
  return eventIdCounter++;
}

/**
 * Create a legacy DemEventParameter value.
 * @param shortName Initial shortName value.
 * @returns The initialized DemEventParameter value.
 */
export function createDemEventParameter(shortName: string): DemEventParameter {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demEventId: generateEventId(),
    demEventKind: DemEventKind.SWC,
    demEventAvailable: true,
    demEventFailureCycleCounterThreshold: 0,
    demFFPrestorageSupported: false,
    demDebounceAlgorithm: { type: DemDebounceType.NONE },
  };
}
