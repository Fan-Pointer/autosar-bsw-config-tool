import type {
  ConstraintRule,
  ConstraintViolation,
  ConstraintContext,
} from '@/core/constraint/ConstraintTypes';
import { collectContainers, type ContainerEntry } from '@/core/config/ConfigTraversal';

function entries(ctx: ConstraintContext, name: string): ContainerEntry[] {
  if (ctx.bswmdModule.shortName !== 'Dem') return [];
  return collectContainers(ctx.configInstance, ctx.bswmdModule).filter(
    (entry) => entry.definition.shortName === name
  );
}

function parameter(entry: ContainerEntry, name: string) {
  const definition = entry.definition.parameters.find((item) => item.shortName === name);
  return definition ? entry.container.parameters.get(definition.uuid)?.value : undefined;
}

function optionalUnset(entry: ContainerEntry, name: string): boolean {
  // 用户裁定（2026-11-09）默认值即配置：可选参数未被用户显式确认时，模块规则不对其
  // 施加域检查（预填默认值不是用户选择，不因此产生 DTC 域违规）。
  const field = entry.definition.parameters.find((item) => item.shortName === name);
  if (!field) return true;
  return Boolean(field.isOptional) && entry.container.parameters.get(field.uuid)?.isConfigured !== true;
}

function violation(
  ruleId: string,
  entry: ContainerEntry,
  field: string,
  message: string,
  suggestion: string
): ConstraintViolation {
  return {
    ruleId,
    severity: 'ERROR',
    path: `${entry.path}/${field}`,
    message,
    suggestion,
    containerUuid: entry.container.uuid,
    definitionRef: [...entry.definition.parameters, ...entry.definition.references].find(
      (item) => item.shortName === field
    )?.uuid,
  };
}

function integerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** DEM semantic rules; UUIDs and nesting are resolved from the supplied definition tree. */
export const DemConstraints: ConstraintRule[] = [
  {
    id: 'DEM-001',
    name: 'DTC values must be unique',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx) => {
      const groups = new Map<number, ContainerEntry[]>();
      const violations: ConstraintViolation[] = [];
      for (const entry of entries(ctx, 'DemDTC')) {
        const value = parameter(entry, 'DemDtcValue');
        if (typeof value !== 'number') continue;
        const group = groups.get(value) ?? [];
        group.push(entry);
        groups.set(value, group);
      }
      // Report every participant so each conflicting tree node and field can be navigated.
      for (const [value, group] of groups) {
        if (group.length < 2) continue;
        for (const entry of group) {
          violations.push(
            violation(
              'DEM-001',
              entry,
              'DemDtcValue',
              `Duplicate DTC value: ${value}`,
              'Choose a unique DTC value'
            )
          );
        }
      }
      return violations;
    },
  },
  {
    id: 'DEM-002',
    name: 'DTC values must be in range',
    severity: 'ERROR',
    scope: 'PARAMETER',
    check: (ctx) =>
      entries(ctx, 'DemDTC').flatMap((entry) =>
        optionalUnset(entry, 'DemDtcValue') ||
        integerInRange(parameter(entry, 'DemDtcValue'), 1, 0xffffff)
          ? []
          : [
              violation(
                'DEM-002',
                entry,
                'DemDtcValue',
                'DemDtcValue must be an integer in [0x000001, 0xFFFFFF]',
                'Use a nonzero 24-bit DTC value'
              ),
            ]
      ),
  },
  {
    id: 'DEM-003',
    name: 'Counter thresholds must have the correct signs',
    severity: 'ERROR',
    scope: 'PARAMETER',
    check: (ctx) =>
      entries(ctx, 'DemDebounceCounterBasedClass').flatMap((entry) => {
        const violations: ConstraintViolation[] = [];
        for (const [field, positive] of [
          ['DemDebounceCounterFailedThreshold', true],
          ['DemDebounceCounterPassedThreshold', false],
        ] as const) {
          if (optionalUnset(entry, field)) continue;
          const value = parameter(entry, field);
          if (
            typeof value !== 'number' ||
            !Number.isSafeInteger(value) ||
            (positive ? value <= 0 : value >= 0)
          ) {
            violations.push(
              violation(
                'DEM-003',
                entry,
                field,
                `${field} must be a ${positive ? 'positive' : 'negative'} integer`,
                positive ? 'Set a value greater than 0' : 'Set a value less than 0'
              )
            );
          }
        }
        return violations;
      }),
  },
  {
    id: 'DEM-006',
    name: 'Event IDs must be unique and in range',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx) => {
      const seen = new Set<number>();
      const violations: ConstraintViolation[] = [];
      for (const entry of entries(ctx, 'DemEventParameter')) {
        if (optionalUnset(entry, 'DemEventId')) continue;
        const value = parameter(entry, 'DemEventId');
        if (!integerInRange(value, 1, 65535)) {
          violations.push(
            violation(
              'DEM-006',
              entry,
              'DemEventId',
              'DemEventId must be an integer in [1, 65535]',
              'Use an Event ID between 1 and 65535'
            )
          );
        } else {
          if (seen.has(value))
            violations.push(
              violation(
                'DEM-006',
                entry,
                'DemEventId',
                `Duplicate Event ID: ${value}`,
                'Choose a unique Event ID'
              )
            );
          seen.add(value);
        }
      }
      return violations;
    },
  },
  {
    id: 'DEM-008',
    name: 'Aging requires a valid operation cycle',
    severity: 'ERROR',
    scope: 'REFERENCE',
    check: (ctx) => {
      const targets = new Set(
        entries(ctx, 'DemOperationCycle').map((entry) => entry.container.uuid)
      );
      return entries(ctx, 'DemDTCAttributes').flatMap((entry) => {
        if (parameter(entry, 'DemAgingAllowed') !== true) return [];
        const definition = entry.definition.references.find(
          (item) => item.shortName === 'DemAgingCycleRef'
        );
        const target = definition
          ? entry.container.references.get(definition.uuid)?.targetUuid
          : undefined;
        return target && targets.has(target)
          ? []
          : [
              violation(
                'DEM-008',
                entry,
                'DemAgingCycleRef',
                'DemAgingCycleRef is required when DemAgingAllowed is true',
                'Select an existing operation cycle'
              ),
            ];
      });
    },
  },
];
