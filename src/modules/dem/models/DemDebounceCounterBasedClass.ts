import type { EcucElement } from '@/types/base';
import { generateUUID } from '@/utils/uuid';

export enum DemDebounceBehavior {
  FREEZE = 'DEM_DEBOUNCE_FREEZE',
  RESET = 'DEM_DEBOUNCE_RESET'
}

export interface DemDebounceCounterBasedClass extends EcucElement {
  demDebounceBehavior: DemDebounceBehavior;
  demDebounceCounterFailedThreshold: number;
  demDebounceCounterPassedThreshold: number;
  demDebounceCounterIncrementStepSize: number;
  demDebounceCounterDecrementStepSize: number;
  demDebounceCounterJumpUp: boolean;
  demDebounceCounterJumpUpValue?: number;
  demDebounceCounterJumpDown: boolean;
  demDebounceCounterJumpDownValue?: number;
  demDebounceCounterStorage: boolean;
}

export const DemDebounceCounterValidationRules = {
  demDebounceCounterFailedThreshold: {
    min: 1,
    max: 32767,
    mustBePositive: true
  },
  demDebounceCounterPassedThreshold: {
    min: -32768,
    max: -1,
    mustBeNegative: true
  },
  demDebounceCounterIncrementStepSize: {
    min: 1,
    max: 32767
  },
  demDebounceCounterDecrementStepSize: {
    min: 1,
    max: 32768
  }
};

export function createDemDebounceCounterBasedClass(shortName: string): DemDebounceCounterBasedClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDebounceBehavior: DemDebounceBehavior.FREEZE,
    demDebounceCounterFailedThreshold: 127,
    demDebounceCounterPassedThreshold: -127,
    demDebounceCounterIncrementStepSize: 1,
    demDebounceCounterDecrementStepSize: 1,
    demDebounceCounterJumpUp: false,
    demDebounceCounterJumpDown: false,
    demDebounceCounterStorage: false
  };
}
