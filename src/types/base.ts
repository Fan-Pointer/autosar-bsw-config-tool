/**
 * 基础类型定义
 */

export type UUID = string;

export type EcucRef = string;

export type ShortName = string;

/**
 * 配置类
 */
export enum ConfigClass {
  PRE_COMPILE = 'VARIANT-PRE-COMPILE',
  LINK_TIME = 'VARIANT-LINK-TIME',
  POST_BUILD = 'VARIANT-POST-BUILD'
}

/**
 * 多重性定义
 */
export interface Multiplicity {
  lower: number;
  upper: number | 'unbounded';
}

/**
 * 基础 ECUC 元素
 */
export interface EcucElement {
  uuid: UUID;
  shortName: ShortName;
  description?: string;
}
