/**
 * BSWMD (BSW Module Description) 类型定义
 * 描述 AUTOSAR 模块的参数结构、约束和元数据
 */

export type EcucParameterType =
  'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'FUNCTION' | 'REFERENCE';

export type ConfigClass = 'PRE_COMPILE' | 'LINK_TIME' | 'POST_BUILD';

/**
 * BSWMD 模块根节点
 */
export interface BswmdModule {
  shortName: string;
  version: string;
  description?: string;
  containers: BswmdContainer[];
}

/**
 * BSWMD 容器定义
 */
export interface BswmdContainer {
  uuid: string;
  shortName: string;
  description?: string;
  /** Optional module-authored empty-state action label. */
  initialAddLabel?: string;
  /**
   * 多重性定义
   * - lower: 最小出现次数
   * - upper: 最大出现次数，'unbounded' 表示无上限
   */
  multiplicity: {
    lower: number;
    upper: number | 'unbounded';
  };
  parameters: BswmdParameter[];
  references: BswmdReference[];
  subContainers: BswmdContainer[];
}

/**
 * BSWMD 参数定义
 */
export interface BswmdParameter {
  uuid: string;
  shortName: string;
  description?: string;
  type: EcucParameterType;
  configClass: ConfigClass;
  /** 默认值 */
  defaultValue?: unknown;
  /** 数值范围约束（INTEGER/FLOAT） */
  min?: number;
  max?: number;
  /** 枚举值列表（ENUM 类型） */
  enumValues?: string[];
  /** 是否可选（false = 必填） */
  isOptional: boolean;
}

/**
 * BSWMD 引用定义
 */
export interface BswmdReference {
  uuid: string;
  shortName: string;
  description?: string;
  /** 引用目标容器定义的 shortName，与实例显示名称无关。 */
  destinationContainerType: string;
  isOptional: boolean;
}
