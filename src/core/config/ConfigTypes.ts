import type { UUID } from '@/types/base';

/**
 * 配置实例 - 运行时用户配置
 */
export interface ConfigInstance {
  uuid: UUID;
  /** User-visible set name; absent only in legacy saved configurations. */
  name?: string;
  /** 引用 BswmdModule.shortName */
  moduleRef: string;
  version: string;
  containers: ConfigContainer[];
  /** 创建时间戳 */
  createdAt: number;
  /** 最后修改时间戳 */
  lastModified: number;
}

/**
 * 配置容器实例
 */
export interface ConfigContainer {
  uuid: UUID;
  /** 引用 BswmdContainer.uuid */
  definitionRef: string;
  shortName: string;
  description?: string;
  parameters: Map<string, ConfigParameterValue>;
  references: Map<string, ConfigReferenceValue>;
  subContainers: ConfigContainer[];
}

/**
 * 配置参数值
 */
export interface ConfigParameterValue {
  /** 引用 BswmdParameter.uuid */
  definitionRef: string;
  /** Description from the loaded definition, unless the input supplies one. */
  description?: string;
  /** 单值参数为标量；多值参数（G32）为数组，每元素一行。 */
  value: unknown;
  /** 是否已配置（非默认值） */
  isConfigured: boolean;
}

/** Whether a definition allows more than one value row (G32 multi-value editing). */
export function isMultiValueParameter(
  parameter: { multiplicity?: { lower: number; upper: number | 'unbounded' } } | undefined
): boolean {
  const upper = parameter?.multiplicity?.upper;
  if (upper === undefined) return false;
  return upper === 'unbounded' || upper > 1;
}

/**
 * 配置引用值
 */
export interface ConfigReferenceValue {
  /** 引用 BswmdReference.uuid */
  definitionRef: string;
  /** 引用的容器 UUID；空字符串表示尚未选择目标（单值引用的兼容字段）。 */
  targetUuid: UUID;
  /** G42 多值引用（multiplicity 上限 >1）：逐项目标；单值引用保持省略。 */
  targetUuids?: string[];
  /** Whether the user explicitly selected this reference. */
  isConfigured: boolean;
}

/** 引用是否允许多目标（定义 multiplicity 上限 >1 或 unbounded）。 */
export function isMultiReference(
  reference: { multiplicity?: { lower: number; upper: number | 'unbounded' } } | undefined
): boolean {
  return isMultiValueParameter(reference);
}

/** 统一读取引用的目标列表：多值读数组，单值读兼容字段。 */
export function referenceTargets(value: ConfigReferenceValue | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value.targetUuids)) return value.targetUuids.filter((item) => item !== '');
  return value.targetUuid ? [value.targetUuid] : [];
}
