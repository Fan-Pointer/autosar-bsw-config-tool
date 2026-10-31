import type {
  BswmdModule,
  BswmdContainer,
  BswmdParameter,
  BswmdReference,
  ConfigClass,
  EcucParameterType,
} from './BswmdTypes';
import { importEcucModuleArxml } from './EcucArxmlImporter';

const parameterTypes: readonly EcucParameterType[] = [
  'INTEGER',
  'FLOAT',
  'BOOLEAN',
  'STRING',
  'ENUM',
  'FUNCTION',
  'REFERENCE',
];
const configClasses: readonly ConfigClass[] = ['PRE_COMPILE', 'LINK_TIME', 'POST_BUILD'];

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(data: Record<string, unknown>, field: string, path: string): string {
  const value = data[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path}: missing or invalid required field ${field}`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${path}: expected a string`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
  return value;
}

function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path}: expected a finite number`);
  return value;
}

function optionalFlag(value: unknown, path: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`${path}: expected a boolean`);
  return value;
}

/** Parse JSON module descriptions without depending on a UI framework. */
export class BswmdParser {
  /** Read a selected official ECUC module, leaving the JSON entry's semantics unchanged.
   * @param source ARXML text. @param moduleShortName Exact module name.
   * @returns Parsed module definition.
   */
  parseFromArxml(source: string, moduleShortName: string): BswmdModule {
    return importEcucModuleArxml(source, moduleShortName);
  }
  /**
   * Parse and validate every definition, including nested containers.
   * @param jsonString Serialized BSWMD definition.
   * @returns A validated module tree.
   */
  parseFromJson(jsonString: string): BswmdModule {
    try {
      const raw: unknown = JSON.parse(jsonString);
      const data = object(raw, 'module');
      const ids = new Set<string>();
      return {
        shortName: requiredString(data, 'shortName', 'module'),
        version: optionalString(data.version, 'module.version') ?? 'unknown',
        description: optionalString(data.description, 'module.description'),
        containers: this.containers(data.containers, 'module.containers', ids, 0),
      };
    } catch (error) {
      throw new Error(
        `Failed to parse BSWMD JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private identity(data: Record<string, unknown>, path: string, ids: Set<string>) {
    const label = `${path}${typeof data.shortName === 'string' ? ` (${data.shortName})` : ''}`;
    const uuid = requiredString(data, 'uuid', label);
    if (ids.has(uuid)) throw new Error(`${label}: duplicate uuid ${uuid}`);
    ids.add(uuid);
    return {
      uuid,
      shortName: requiredString(data, 'shortName', label),
      description: optionalString(data.description, `${label}.description`),
    };
  }

  private containers(
    value: unknown,
    path: string,
    ids: Set<string>,
    depth: number
  ): BswmdContainer[] {
    // JSON cannot contain cycles, but excessively deep input can still exhaust the JS stack.
    if (depth > 128) throw new Error(`${path}: maximum container depth 128 exceeded`);
    return array(value, path).map((raw, index) => {
      const location = `${path}[${index}]`;
      const data = object(raw, location);
      const identity = this.identity(data, location, ids);
      const childPath = `${location} (${identity.shortName})`;
      return {
        ...identity,
        initialAddLabel: optionalString(data.initialAddLabel, `${childPath}.initialAddLabel`),
        multiplicity: this.multiplicity(data.multiplicity, childPath),
        parameters: array(data.parameters, `${childPath}.parameters`).map((item, i) =>
          this.parameter(item, `${childPath}.parameters[${i}]`, ids)
        ),
        references: array(data.references, `${childPath}.references`).map((item, i) =>
          this.reference(item, `${childPath}.references[${i}]`, ids)
        ),
        subContainers: this.containers(
          data.subContainers,
          `${childPath}.subContainers`,
          ids,
          depth + 1
        ),
      };
    });
  }

  private multiplicity(value: unknown, path: string): BswmdContainer['multiplicity'] {
    if (value === undefined) return { lower: 1, upper: 1 };
    const data = object(value, `${path}.multiplicity`);
    const lower = optionalNumber(data.lower, `${path}.multiplicity.lower`) ?? 1;
    const upper =
      data.upper === 'unbounded'
        ? 'unbounded'
        : (optionalNumber(data.upper, `${path}.multiplicity.upper`) ?? 1);
    if (
      !Number.isSafeInteger(lower) ||
      lower < 0 ||
      (upper !== 'unbounded' && (!Number.isSafeInteger(upper) || upper < lower))
    ) {
      throw new Error(
        `${path}.multiplicity: expected non-negative integer bounds with upper >= lower`
      );
    }
    return { lower, upper };
  }

  private parameter(raw: unknown, path: string, ids: Set<string>): BswmdParameter {
    const data = object(raw, path);
    const identity = this.identity(data, path, ids);
    const label = `${path} (${identity.shortName})`;
    const rawType = requiredString(data, 'type', label);
    const type = parameterTypes.find((item) => item === rawType);
    if (!type) throw new Error(`${label}.type: unsupported parameter type ${rawType}`);
    const configClass = configClasses.find((item) => item === (data.configClass ?? 'PRE_COMPILE'));
    if (!configClass) throw new Error(`${label}.configClass: unsupported configuration class`);
    const min = optionalNumber(data.min, `${label}.min`);
    const max = optionalNumber(data.max, `${label}.max`);
    if (min !== undefined && max !== undefined && min > max)
      throw new Error(`${label}: min must be <= max`);
    const enumValues =
      data.enumValues === undefined
        ? undefined
        : array(data.enumValues, `${label}.enumValues`).map((item, i) => {
            if (typeof item !== 'string')
              throw new Error(`${label}.enumValues[${i}]: expected a string`);
            return item;
          });
    if (type === 'ENUM' && !enumValues?.length)
      throw new Error(`${label}.enumValues: ENUM requires choices`);
    const defaultValue = data.defaultValue;
    if (defaultValue !== undefined) {
      const valid =
        type === 'BOOLEAN'
          ? typeof defaultValue === 'boolean'
          : type === 'INTEGER'
            ? typeof defaultValue === 'number' && Number.isSafeInteger(defaultValue)
            : type === 'FLOAT'
              ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
              : typeof defaultValue === 'string' &&
                (type !== 'ENUM' || enumValues?.includes(defaultValue));
      if (
        !valid ||
        (typeof defaultValue === 'number' &&
          ((min !== undefined && defaultValue < min) || (max !== undefined && defaultValue > max)))
      ) {
        throw new Error(`${label}.defaultValue: incompatible with type or bounds`);
      }
    }
    return {
      ...identity,
      exportRole: this.exportRole(
        data.exportRole,
        ['dtcValue', 'severity', 'wwhObdClass', 'eventId'] as const,
        label
      ),
      type,
      configClass,
      readOnly: optionalFlag(data.readOnly, `${label}.readOnly`),
      defaultValue,
      min,
      max,
      enumValues,
      isOptional: optionalFlag(data.isOptional, `${label}.isOptional`),
    };
  }

  private reference(raw: unknown, path: string, ids: Set<string>): BswmdReference {
    const data = object(raw, path);
    return {
      ...this.identity(data, path, ids),
      exportRole: this.exportRole(data.exportRole, ['attributes', 'dtc'] as const, path),
      destinationContainerType: requiredString(data, 'destinationContainerType', path),
      isOptional: optionalFlag(data.isOptional, `${path}.isOptional`),
    };
  }

  private exportRole<T extends string>(
    value: unknown,
    allowed: readonly T[],
    path: string
  ): T | undefined {
    if (value === undefined) return undefined;
    const role = allowed.find((item) => item === value);
    if (!role) throw new Error(`${path}.exportRole: unsupported CSV role`);
    return role;
  }
}
