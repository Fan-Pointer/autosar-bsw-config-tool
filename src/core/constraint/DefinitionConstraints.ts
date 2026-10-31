import type { ConstraintRule, ConstraintViolation } from './ConstraintTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { choiceSelectionError } from '../config/ChoiceSelection';

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
        const add = (uuid: string, name: string, message: string, suggestion: string): void => {
          violations.push({
            ruleId: 'BSWMD-FIELDS',
            severity: 'ERROR',
            path: `${entry.path}/${name}`,
            message,
            suggestion,
            containerUuid: entry.container.uuid,
            definitionRef: uuid,
          });
        };
        const choiceError = choiceSelectionError(entry.container, entry.definition, true);
        if (choiceError)
          add(entry.definition.uuid, '', choiceError, '选择一个候选；切换候选可撤销');
        for (const parameter of entry.definition.parameters) {
          const value = entry.container.parameters.get(parameter.uuid)?.value;
          if (value === undefined || value === null) {
            if (!parameter.isOptional)
              add(
                parameter.uuid,
                parameter.shortName,
                `${parameter.shortName} is required`,
                `Set required parameter ${parameter.shortName} (${parameter.type})`
              );
            continue;
          }
          const numeric = parameter.type === 'INTEGER' || parameter.type === 'FLOAT';
          const expected =
            parameter.type === 'INTEGER'
              ? 'INTEGER (safe integer number)'
              : parameter.type === 'FLOAT'
                ? 'FLOAT (finite number)'
                : parameter.type === 'BOOLEAN'
                  ? 'BOOLEAN (true or false)'
                  : `${parameter.type} (string)`;
          const validType = numeric
            ? typeof value === 'number' &&
              Number.isFinite(value) &&
              (parameter.type !== 'INTEGER' || Number.isSafeInteger(value))
            : parameter.type === 'BOOLEAN'
              ? typeof value === 'boolean'
              : typeof value === 'string';
          // Check presence, type, and domain separately so each error gives a specific repair.
          if (!validType) {
            add(
              parameter.uuid,
              parameter.shortName,
              `${parameter.shortName} has an invalid type; expected ${expected}`,
              `Use ${expected} for ${parameter.shortName}`
            );
            continue;
          }
          if (
            numeric &&
            typeof value === 'number' &&
            ((parameter.min !== undefined && value < parameter.min) ||
              (parameter.max !== undefined && value > parameter.max))
          ) {
            const range = `[${parameter.min ?? '-Infinity'}, ${parameter.max ?? 'Infinity'}]`;
            add(
              parameter.uuid,
              parameter.shortName,
              `${parameter.shortName} is out of range; allowed range: ${range}`,
              `Choose a ${parameter.type} value in ${range}`
            );
          } else if (
            parameter.type === 'ENUM' &&
            typeof value === 'string' &&
            !parameter.enumValues?.includes(value)
          ) {
            const choices = (parameter.enumValues ?? [])
              .map((choice) => JSON.stringify(choice))
              .join(', ');
            add(
              parameter.uuid,
              parameter.shortName,
              `${parameter.shortName} has an invalid choice; allowed values: ${choices}`,
              `Choose one of: ${choices}`
            );
          }
        }
        for (const reference of entry.definition.references) {
          const targetUuid = entry.container.references.get(reference.uuid)?.targetUuid;
          if (!targetUuid) {
            if (!reference.isOptional)
              add(
                reference.uuid,
                reference.shortName,
                `${reference.shortName} is required`,
                `Set required reference ${reference.shortName} to an existing ${reference.destinationContainerType}`
              );
          } else {
            const target = targets.get(targetUuid);
            if (!target) {
              violations.push({
                ruleId: 'BSWMD-DANGLING-REFERENCE',
                severity: 'ERROR',
                path: `${entry.path}/${reference.shortName}`,
                message: `${reference.shortName}：目标不存在（${targetUuid.slice(0, 8)}）`,
                suggestion: '清除引用或选择存在的目标实例',
                containerUuid: entry.container.uuid,
                definitionRef: reference.uuid,
              });
            } else if (
              reference.destinationRef
                ? target.definition.definitionPath !== reference.destinationRef
                : target.definition.shortName !== reference.destinationContainerType
            ) {
              add(
                reference.uuid,
                reference.shortName,
                `${reference.shortName} must target ${reference.destinationContainerType}`,
                `Select an existing ${reference.destinationContainerType} container`
              );
            }
          }
        }
      }
      return violations;
    },
  },
];
