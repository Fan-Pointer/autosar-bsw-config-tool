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
  value: unknown;
  /** 是否已配置（非默认值） */
  isConfigured: boolean;
}

/**
 * 配置引用值
 */
export interface ConfigReferenceValue {
  /** 引用 BswmdReference.uuid */
  definitionRef: string;
  /** 引用的容器 UUID；空字符串表示尚未选择目标。 */
  targetUuid: UUID;
  /** Whether the user explicitly selected this reference. */
  isConfigured: boolean;
}
