import type {
  ConfigContainer,
  ConfigInstance,
  ConfigParameterValue,
  ConfigReferenceValue,
} from '../config/ConfigTypes';

export type ImportFormat = 'json' | 'arxml';
export type ExportFormat = ImportFormat | 'csv';
export type ConflictStrategy = 'overwrite' | 'skip' | 'rename';

export interface SerializedContainer extends Omit<
  ConfigContainer,
  'parameters' | 'references' | 'subContainers'
> {
  parameters: ConfigParameterValue[];
  references: ConfigReferenceValue[];
  subContainers: SerializedContainer[];
}
export interface SerializedConfig extends Omit<ConfigInstance, 'containers'> {
  containers: SerializedContainer[];
}
export interface ImportConflict {
  path: string;
  parameter: string;
  fileValue: string;
  projectValue: string;
}
export interface ImportPlan {
  result: ConfigInstance;
  conflicts: ImportConflict[];
  addedContainers: number;
  addedParameters: number;
  deletedItems: number;
}
export interface ImportSession {
  incoming: ConfigInstance;
  targetUuid?: string;
  baseline: string;
}
