import type { BswmdModule } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import { collectContainers, indexDefinitions } from '../config/ConfigTraversal';
import { ConstraintEngine } from '../constraint/ConstraintEngine';
import { DefinitionConstraints } from '../constraint/DefinitionConstraints';
import type { ConstraintRule, ConstraintViolation } from '../constraint/ConstraintTypes';

export interface OutputIssue {
  severity: ConstraintViolation['severity'];
  path: string;
  reason: string;
  anchor: { containerUuid: string; definitionRef?: string };
  ruleId: string;
  suggestion?: string;
}

export interface OutputCheckResult {
  ready: boolean;
  issues: OutputIssue[];
}

/** Evaluate the currently configured values, never the editor's unconfirmed suggestions.
 * @param config Live configuration; never mutated.
 * @param module Matching definition.
 * @param extraRules Optional module rules supplied by the application layer.
 * @returns A fresh result for this action. Do not cache it across edits/actions.
 */
export function evaluateOutputReadiness(
  config: ConfigInstance,
  module: BswmdModule,
  extraRules: readonly ConstraintRule[] = []
): OutputCheckResult {
  try {
    if (config.moduleRef !== module.shortName || config.version !== module.version)
      throw new Error('Configuration moduleRef/version does not match BSWMD');
    // Keep existing validators authoritative for types/domains/references.
    // 用户裁定（2026-11-09）默认值即配置：未显式确认的参数值（预填值/定义默认值）
    // 原样参与导出校验，不再清空——「等于默认值」是合法配置状态。
    // 引用保持旧语义：未确认引用按空目标校验（引用无默认值概念，仍需显式配置）。
    const confirmed = (container: ConfigContainer): ConfigContainer => ({
      ...container,
      parameters: new Map([...container.parameters].map(([id, value]) => [id, { ...value }])),
      references: new Map(
        [...container.references].map(([id, value]) => [
          id,
          {
            ...value,
            targetUuid: value.isConfigured ? value.targetUuid : '',
          },
        ])
      ),
      subContainers: container.subContainers.map(confirmed),
    });
    const checked = { ...config, containers: config.containers.map(confirmed) };
    const engine = new ConstraintEngine();
    engine.registerRules([...DefinitionConstraints, ...extraRules]);
    const references = new Map(
      [...indexDefinitions(module).values()].flatMap((def) =>
        def.references.map((ref) => [ref.uuid, ref] as const)
      )
    );
    const issues: OutputIssue[] = engine
      .validate(checked, module)
      .filter((violation) => !references.get(violation.definitionRef ?? '')?.isExternal)
      .map((violation) => ({
        severity: violation.severity,
        path: violation.path,
        reason: violation.message.endsWith(' is required')
          ? `${references.has(violation.definitionRef ?? '') ? '必填引用未配置' : '必填项未配置'}：${violation.message}`
          : violation.message,
        anchor: {
          containerUuid: violation.containerUuid ?? config.uuid,
          definitionRef: violation.definitionRef,
        },
        ruleId: violation.ruleId,
        suggestion: violation.suggestion,
      }));
    // Unsupported cross-module links are distinct from fixable, empty local references.
    // A fabricated local UUID must not make an external definition appear supported.
    for (const entry of collectContainers(checked, module))
      for (const reference of entry.definition.references) {
        const value = entry.container.references.get(reference.uuid);
        if (
          reference.isExternal &&
          (!reference.isOptional || (value?.isConfigured && value.targetUuid))
        )
          issues.push({
            severity: 'ERROR',
            path: `${entry.path}/${reference.shortName}`,
            reason: `目标跨模块（本期不支持）：${reference.shortName} → ${reference.destinationRef ?? reference.destinationContainerType}`,
            anchor: { containerUuid: entry.container.uuid, definitionRef: reference.uuid },
            ruleId: 'OUTPUT-EXTERNAL-REFERENCE',
          });
      }
    for (const reason of module.arxmlExportBlockers ?? [])
      issues.push({
        severity: 'ERROR',
        path: module.shortName,
        reason,
        anchor: { containerUuid: config.uuid },
        ruleId: 'OUTPUT-UNSUPPORTED-DEFINITION',
      });
    return { ready: !issues.some((issue) => issue.severity === 'ERROR'), issues };
  } catch (error) {
    return {
      ready: false,
      issues: [
        {
          severity: 'ERROR',
          path: config.moduleRef,
          reason: error instanceof Error ? error.message : String(error),
          anchor: { containerUuid: config.uuid },
          ruleId: 'OUTPUT-STRUCTURE',
        },
      ],
    };
  }
}

/** Compatibility name for the shared output evaluator.
 * @param config Current configuration. @param module Definition. @param extraRules Module rules.
 * @returns Fresh output readiness result.
 */
export const isOutputReady = evaluateOutputReadiness;

/** Output rejection retains the exact issue collection shown by the validator. */
export class OutputValidationError extends Error {
  /** @param result Readiness evaluated in this same synchronous action. */
  constructor(readonly result: OutputCheckResult) {
    super(
      `输出校验失败：\n${result.issues
        .filter((issue) => issue.severity === 'ERROR')
        .map((issue) => `${issue.path}：${issue.reason}`)
        .join('\n')}`
    );
    this.name = 'OutputValidationError';
  }
}

/** Consume a same-action result without implementing another validator.
 * @param result Fresh result. @returns Nothing; throws a structured output rejection.
 */
export function assertOutputReady(result: OutputCheckResult): void {
  if (!result.ready) throw new OutputValidationError(result);
}

/** Adapt issues to the existing panel and field navigation contract without recalculation.
 * @param result Fresh readiness result. @returns Panel violations with stable anchors.
 */
export function outputViolations(result: OutputCheckResult): ConstraintViolation[] {
  return result.issues.map((issue) => ({
    ruleId: issue.ruleId,
    severity: issue.severity,
    path: issue.path,
    message: issue.reason,
    suggestion: issue.suggestion,
    containerUuid: issue.anchor.containerUuid,
    definitionRef: issue.anchor.definitionRef,
  }));
}
