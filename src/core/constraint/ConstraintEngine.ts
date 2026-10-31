import type { ConstraintRule, ConstraintViolation, ConstraintContext } from './ConstraintTypes';
import type { ConfigInstance } from '@/core/config/ConfigTypes';
import type { BswmdModule } from '@/core/bswmd/BswmdTypes';

/**
 * 约束引擎
 * 管理和执行约束验证规则
 */
export class ConstraintEngine {
  private rules: ConstraintRule[] = [];

  /**
   * 注册约束规则
   */
  registerRule(rule: ConstraintRule): void {
    // 检查是否已存在相同 ID 的规则
    const existingIndex = this.rules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      // 替换已有规则
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * 批量注册规则
   */
  registerRules(rules: ConstraintRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * 验证配置实例
   */
  validate(config: ConfigInstance, bswmd: BswmdModule): ConstraintViolation[] {
    const context: ConstraintContext = {
      configInstance: config,
      bswmdModule: bswmd
    };

    const violations: ConstraintViolation[] = [];

    for (const rule of this.rules) {
      try {
        const result = rule.check(context);
        violations.push(...result);
      } catch (error) {
        console.error(`Constraint rule ${rule.id} failed:`, error);
        violations.push({
          ruleId: rule.id,
          severity: 'ERROR',
          path: '',
          message: `Rule execution failed: ${(error as Error).message}`,
          suggestion: 'Check rule implementation'
        });
      }
    }

    return violations;
  }

  /**
   * 获取已注册的所有规则
   */
  getRules(): ConstraintRule[] {
    return [...this.rules];
  }

  /**
   * 获取指定 ID 的规则
   */
  getRule(id: string): ConstraintRule | undefined {
    return this.rules.find(r => r.id === id);
  }

  /**
   * 移除规则
   */
  unregisterRule(id: string): boolean {
    const index = this.rules.findIndex(r => r.id === id);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 清空所有规则
   */
  clearRules(): void {
    this.rules = [];
  }
}
