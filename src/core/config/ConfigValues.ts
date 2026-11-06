import type { BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigParameterValue } from './ConfigTypes';

/** Create an unconfigured editor suggestion, never an explicit ECUC value.
 * @param definition Loaded parameter metadata.
 * @returns A fresh field with its definition description and suggested value.
 */
export function createParameterValue(definition: BswmdParameter): ConfigParameterValue {
  const fallback = (): unknown => {
    switch (definition.type) {
      case 'BOOLEAN':
        return false;
      case 'INTEGER':
      case 'FLOAT':
        return definition.min ?? 0;
      case 'ENUM':
        return definition.sourceDefaultValue !== undefined
          ? ''
          : (definition.enumValues?.[0] ?? '');
      default:
        return '';
    }
  };
  return {
    definitionRef: definition.uuid,
    description: definition.description,
    value: definition.defaultValue !== undefined ? definition.defaultValue : fallback(),
    isConfigured: false,
  };
}
