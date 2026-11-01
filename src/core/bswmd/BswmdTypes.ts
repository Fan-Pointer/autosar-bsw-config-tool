/**
 * BSWMD (BSW Module Description) 类型定义
 * 描述 AUTOSAR 模块的参数结构、约束和元数据
 */

export type EcucParameterType =
  'INTEGER' | 'FLOAT' | 'BOOLEAN' | 'STRING' | 'ENUM' | 'FUNCTION' | 'REFERENCE';

export type ConfigClass = 'PRE_COMPILE' | 'LINK_TIME' | 'POST_BUILD';

export interface Multiplicity {
  lower: number;
  upper: number | 'unbounded';
}

/**
 * BSWMD 模块根节点
 */
export interface BswmdModule {
  multiplicity?: Multiplicity;
  /** Explicit import limitations, shown before accepting a definition. */
  importWarnings?: string[];
  /** Semantics retained for editing but not yet representable by the value exporter. */
  arxmlExportBlockers?: string[];
  shortName: string;
  version: string;
  description?: string;
  containers: BswmdContainer[];
}

/**
 * BSWMD 容器定义
 */
export interface BswmdContainer {
  /** A choice group owns exactly one selected child; refs identify candidates in subContainers. */
  choice?: { candidateRefs: string[] };
  /** Absolute source definition path, when imported from ECUC. */
  definitionPath?: string;
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
  multiplicity?: Multiplicity;
  minLength?: number;
  maxLength?: number;
  regularExpression?: string;
  /** Definition-owned editing restriction, also enforced by batch edits. */
  readOnly?: boolean;
  /** Optional semantic column role for the DTC CSV projection. */
  exportRole?: 'dtcValue' | 'severity' | 'wwhObdClass' | 'eventId';
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
  multiplicity?: Multiplicity;
  destinationRef?: string;
  /** 全部候选目标定义路径。普通引用 1 个；CHOICE 引用多个（来自 DESTINATION-REFS）。 */
  destinationRefs?: string[];
  /** 引用种类：普通 / 多候选（CHOICE） / 外部（FOREIGN） / 实例（INSTANCE）。 */
  kind?: 'reference' | 'choice' | 'foreign' | 'instance';
  /** 目标不在本模块内（外部或实例引用），编辑器不能从当前配置集挑选。 */
  isExternal?: boolean;
  /** Optional relation role for the DTC CSV projection. */
  exportRole?: 'attributes' | 'dtc';
  uuid: string;
  shortName: string;
  description?: string;
  /** 引用目标容器定义的 shortName，与实例显示名称无关。 */
  destinationContainerType: string;
  isOptional: boolean;
}
