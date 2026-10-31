import type { ConstraintRule, ConstraintViolation } from './ConstraintTypes';
import { collectContainers } from '../config/ConfigTraversal';

/** Validate field types, bounds, choices, and reference targets directly from BSWMD. */
export const DefinitionConstraints: ConstraintRule[] = [
  {
    id: 'BSWMD-FIELDS',
    name: 'Definition-driven field validation',
    severity: 'ERROR',
    scope: 'MODULE',
    check: (ctx) => {
      const entries = collectContainers(ctx.configInstance, ctx.bswmdModule);
      const targets = new Map(entries.map((entry) => [entry.container.uuid, entry]));
      const violations: ConstraintViolation[] = [];
      for (const entry of entries) {
        const add = (uuid: string, name: string, message: string): void => {
          violations.push({
            ruleId: 'BSWMD-FIELDS',
            severity: 'ERROR',
            path: `${entry.path}/${name}`,
            message,
            suggestion: 'Use a value allowed by the module definition',
            containerUuid: entry.container.uuid,
            definitionRef: uuid,
          });
        };
        for (const parameter of entry.definition.parameters) {
          const value = entry.container.parameters.get(parameter.uuid)?.value;
          if (value === undefined || value === null || value === '') {
            if (!parameter.isOptional)
              add(parameter.uuid, parameter.shortName, `${parameter.shortName} is required`);
            continue;
          }
          const numeric = parameter.type === 'INTEGER' || parameter.type === 'FLOAT';
          const valid = numeric
            ? typeof value === 'number' &&
              Number.isFinite(value) &&
              (parameter.type !== 'INTEGER' || Number.isSafeInteger(value)) &&
              (parameter.min === undefined || value >= parameter.min) &&
              (parameter.max === undefined || value <= parameter.max)
            : parameter.type === 'BOOLEAN'
              ? typeof value === 'boolean'
              : typeof value === 'string' &&
                (parameter.type !== 'ENUM' || parameter.enumValues?.includes(value));
          if (!valid)
            add(
              parameter.uuid,
              parameter.shortName,
              `${parameter.shortName} has an invalid type, range, or choice`
            );
        }
        for (const reference of entry.definition.references) {
          const targetUuid = entry.container.references.get(reference.uuid)?.targetUuid;
          if (!targetUuid) {
            if (!reference.isOptional)
              add(reference.uuid, reference.shortName, `${reference.shortName} is required`);
          } else {
            const target = targets.get(targetUuid);
            if (!target || target.definition.shortName !== reference.destinationContainerType) {
              add(
                reference.uuid,
                reference.shortName,
                `${reference.shortName} must target ${reference.destinationContainerType}`
              );
            }
          }
        }
      }
      return violations;
    },
  },
];
