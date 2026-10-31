import type { ConfigInstance, ConfigContainer, ConfigParameterValue } from '@/core/config/ConfigTypes';
import type { BswmdModule } from '@/core/bswmd/BswmdTypes';

/**
 * 约束违规
 */
export interface ConstraintViolation {
  /** 规则 ID */
  ruleId: string;
  /** 严重程度 */
  severity: 'ERROR' | 'WARNING' | 'INFO';
  /** 配置路径，如 "DemConfigSet/DemDTC_0/demDtcValue" */
  path: string;
  /** 错误消息 */
  message: string;
  /** 修复建议 */
  suggestion?: string;
}

/**
 * 约束上下文
 */
export interface ConstraintContext {
  /** 配置实例 */
  configInstance: ConfigInstance;
  /** BSWMD 模块定义 */
  bswmdModule: BswmdModule;
  /** 当前检查的目标（可选） */
  target?: ConfigContainer | ConfigParameterValue;
}

/**
 * 约束规则
 */
export interface ConstraintRule {
  /** 规则唯一标识 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 严重程度 */
  severity: 'ERROR' | 'WARNING' | 'INFO';
  /** 作用范围 */
  scope: 'PARAMETER' | 'CONTAINER' | 'MODULE' | 'REFERENCE';
  /** 检查函数 */
  check: (context: ConstraintContext) => ConstraintViolation[];
}
