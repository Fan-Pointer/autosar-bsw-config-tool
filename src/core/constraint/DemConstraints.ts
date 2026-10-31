import type { ConstraintRule, ConstraintViolation, ConstraintContext } from './ConstraintTypes';
import type { ConfigContainer } from '@/core/config/ConfigTypes';

/**
 * DEM 模块内置约束规则
 */
export const DemConstraints: ConstraintRule[] = [
  // R-001: DTC Value 唯一性
  {
    id: 'DEM-001',
    name: 'DTC Value must be unique',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx: ConstraintContext): ConstraintViolation[] => {
      const violations: ConstraintViolation[] = [];
      const dtcValues = new Map<number, string>();

      // 查找 DemConfigSet 容器
      for (const container of ctx.configInstance.containers) {
        if (container.definitionRef === 'ecuc-dem-configset-def') {
          // 查找 DemDTC 子容器
          for (const dtcContainer of container.subContainers) {
            if (dtcContainer.definitionRef === 'ecuc-dem-dtc-def') {
              const dtcValueParam = dtcContainer.parameters.get('ecuc-dem-dtc-value');
              if (dtcValueParam && typeof dtcValueParam.value === 'number') {
                const value = dtcValueParam.value;

                if (dtcValues.has(value)) {
                  violations.push({
                    ruleId: 'DEM-001',
                    severity: 'ERROR',
                    path: `${container.shortName}/${dtcContainer.shortName}/DemDtcValue`,
                    message: `Duplicate DTC value: 0x${value.toString(16).toUpperCase().padStart(6, '0')}`,
                    suggestion: `Choose a unique DTC value`
                  });
                } else {
                  dtcValues.set(value, dtcContainer.shortName);
                }
              }
            }
          }
        }
      }

      return violations;
    }
  },

  // R-002: DTC Value 范围检查
  {
    id: 'DEM-002',
    name: 'DTC Value must be within valid range',
    severity: 'ERROR',
    scope: 'PARAMETER',
    check: (ctx: ConstraintContext): ConstraintViolation[] => {
      const violations: ConstraintViolation[] = [];

      // 遍历查找 DTC Value 参数
      for (const container of ctx.configInstance.containers) {
        for (const dtcContainer of container.subContainers) {
          const dtcValueParam = dtcContainer.parameters.get('ecuc-dem-dtc-value');
          if (dtcValueParam) {
            const value = dtcValueParam.value;
            if (typeof value === 'number') {
              if (value < 1 || value > 16777215) {
                violations.push({
                  ruleId: 'DEM-002',
                  severity: 'ERROR',
                  path: `${container.shortName}/${dtcContainer.shortName}/DemDtcValue`,
                  message: `DTC value 0x${value.toString(16)} is out of range [0x000001, 0xFFFFFF]`,
                  suggestion: 'Use a value between 0x000001 and 0xFFFFFF'
                });
              }
              // R-005: DTC Value 不能是保留值 0x000000
              if (value === 0) {
                violations.push({
                  ruleId: 'DEM-002',
                  severity: 'ERROR',
                  path: `${container.shortName}/${dtcContainer.shortName}/DemDtcValue`,
                  message: 'DTC value 0x000000 is reserved',
                  suggestion: 'Use a value between 0x000001 and 0xFFFFFF'
                });
              }
            }
          }
        }
      }

      return violations;
    }
  },

  // R-003: 计数器阈值正负检查
  {
    id: 'DEM-003',
    name: 'Counter debounce thresholds must have correct signs',
    severity: 'ERROR',
    scope: 'PARAMETER',
    check: (ctx: ConstraintContext): ConstraintViolation[] => {
      const violations: ConstraintViolation[] = [];

      for (const container of ctx.configInstance.containers) {
        for (const debounceContainer of container.subContainers) {
          if (debounceContainer.definitionRef === 'ecuc-dem-debounce-counter-def') {
            const failedParam = debounceContainer.parameters.get('ecuc-dem-debounce-counter-failed-threshold');
            const passedParam = debounceContainer.parameters.get('ecuc-dem-debounce-counter-passed-threshold');

            // R-001: FailedThreshold 必须为正
            if (failedParam && typeof failedParam.value === 'number') {
              if (failedParam.value <= 0) {
                violations.push({
                  ruleId: 'DEM-003',
                  severity: 'ERROR',
                  path: `${container.shortName}/${debounceContainer.shortName}/DemDebounceCounterFailedThreshold`,
                  message: `Failed threshold must be positive, got ${failedParam.value}`,
                  suggestion: 'Set a value greater than 0'
                });
              }
            }

            // R-002: PassedThreshold 必须为负
            if (passedParam && typeof passedParam.value === 'number') {
              if (passedParam.value >= 0) {
                violations.push({
                  ruleId: 'DEM-003',
                  severity: 'ERROR',
                  path: `${container.shortName}/${debounceContainer.shortName}/DemDebounceCounterPassedThreshold`,
                  message: `Passed threshold must be negative, got ${passedParam.value}`,
                  suggestion: 'Set a value less than 0'
                });
              }
            }
          }
        }
      }

      return violations;
    }
  },

  // R-008: Aging 依赖检查
  {
    id: 'DEM-008',
    name: 'AgingCycleRef required when AgingAllowed is true',
    severity: 'ERROR',
    scope: 'CONTAINER',
    check: (ctx: ConstraintContext): ConstraintViolation[] => {
      const violations: ConstraintViolation[] = [];

      for (const container of ctx.configInstance.containers) {
        for (const attrContainer of container.subContainers) {
          if (attrContainer.definitionRef === 'ecuc-dem-dtc-attributes-def') {
            const agingAllowedParam = attrContainer.parameters.get('ecuc-dem-attr-aging-allowed');
            const agingCycleRef = attrContainer.references.get('ecuc-dem-attr-aging-cycleref');

            if (agingAllowedParam?.value === true) {
              // 检查是否配置了 AgingCycleRef
              if (!agingCycleRef || !agingCycleRef.targetUuid) {
                violations.push({
                  ruleId: 'DEM-008',
                  severity: 'ERROR',
                  path: `${container.shortName}/${attrContainer.shortName}`,
                  message: 'DemAgingCycleRef is required when DemAgingAllowed is true',
                  suggestion: 'Set DemAgingCycleRef to a valid operation cycle'
                });
              }
            }
          }
        }
      }

      return violations;
    }
  },

  // R-006: EventId 唯一性
  {
    id: 'DEM-006',
    name: 'Event ID must be unique',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx: ConstraintContext): ConstraintViolation[] => {
      const violations: ConstraintViolation[] = [];
      const eventIds = new Map<number, string>();

      for (const container of ctx.configInstance.containers) {
        for (const eventContainer of container.subContainers) {
          if (eventContainer.definitionRef === 'ecuc-dem-event-param-def') {
            const eventIdParam = eventContainer.parameters.get('ecuc-dem-event-id');
            if (eventIdParam && typeof eventIdParam.value === 'number') {
              const eventId = eventIdParam.value;

              if (eventIds.has(eventId)) {
                violations.push({
                  ruleId: 'DEM-006',
                  severity: 'ERROR',
                  path: `${container.shortName}/${eventContainer.shortName}/DemEventId`,
                  message: `Duplicate Event ID: ${eventId}`,
                  suggestion: 'Use a unique Event ID (1-65535)'
                });
              } else {
                eventIds.set(eventId, eventContainer.shortName);
              }

              // 范围检查
              if (eventId < 1 || eventId > 65535) {
                violations.push({
                  ruleId: 'DEM-006',
                  severity: 'ERROR',
                  path: `${container.shortName}/${eventContainer.shortName}/DemEventId`,
                  message: `Event ID ${eventId} is out of range [1, 65535]`,
                  suggestion: 'Use a value between 1 and 65535'
                });
              }
            }
          }
        }
      }

      return violations;
    }
  }
];
