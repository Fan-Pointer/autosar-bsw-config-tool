import type { EcucElement } from '@/types/base';
import { generateUUID } from '@/utils/uuid';
import { DemDebounceBehavior } from './DemDebounceCounterBasedClass';

export interface DemDebounceTimeBasedClass extends EcucElement {
  demDebounceBehavior: DemDebounceBehavior;
  demDebounceTimeFailedThreshold: number;
  demDebounceTimePassedThreshold: number;
}

export const DemDebounceTimeValidationRules = {
  demDebounceTimeFailedThreshold: {
    min: 0.001,
    max: 3600,
    unit: 's',
  },
  demDebounceTimePassedThreshold: {
    min: 0.001,
    max: 3600,
    unit: 's',
  },
};

/**
 * Create a legacy DemDebounceTimeBasedClass value.
 * @param shortName Initial shortName value.
 * @returns The initialized DemDebounceTimeBasedClass value.
 */
export function createDemDebounceTimeBasedClass(shortName: string): DemDebounceTimeBasedClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDebounceBehavior: DemDebounceBehavior.FREEZE,
    demDebounceTimeFailedThreshold: 0.5,
    demDebounceTimePassedThreshold: 0.5,
  };
}
