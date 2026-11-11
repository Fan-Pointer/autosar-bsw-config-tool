import type { BswmdModule } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import { referenceTargets } from '../config/ConfigTypes';
import type { ProjectReferenceScope } from '../config/ProjectReferenceScope';
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

/**
 * Evaluate the currently configured values, never the editor's unconfirmed suggestions.
 * @param config Live configuration; never mutated.
 * @param module Matching definition.
 * @param extraRules Optional module rules supplied by the application layer.
 * @param scope Optional project reference scope; required to resolve cross-module targets.
 * @returns A fresh result for this action. Do not cache it across edits/actions.
 */
export function evaluateOutputReadiness(
  config: ConfigInstance,
  module: BswmdModule,
  extraRules: readonly ConstraintRule[] = [],
  scope?: ProjectReferenceScope
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
            // 未确认引用按空目标校验：单值与多值必须同时掩码，
            // 否则手改 JSON / 旧库残留的 isConfigured=false + targetUuids 会被误判为已配置。
            targetUuid: value.isConfigured ? value.targetUuid : '',
            targetUuids: value.isConfigured ? value.targetUuids : [],
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
    // 跨模块（外部）引用：目标来自工程作用域，不再一律判「本期不支持」。
    // 判定顺序固定为 未选目标 → 无工程上下文 → 目标不在工程内 → 类型不匹配 → 版本漂移，
    // 每个目标只报第一条，避免同一处引用刷出多条同源问题。
    for (const entry of collectContainers(checked, module))
      for (const reference of entry.definition.references) {
        if (!reference.isExternal) continue;
        const value = entry.container.references.get(reference.uuid);
        const targetUuids = referenceTargets(value);
        const destinations = reference.destinationRefs?.length
          ? reference.destinationRefs
          : reference.destinationRef
            ? [reference.destinationRef]
            : [];
        // 候选过滤与闸门对「无静态目标」必须区别对待：
        // 候选侧（resolveExternalReferenceCandidates）无 DESTINATION-REF 时返回空列表，不臆造目标；
        // 闸门侧则只校验存在性——类型不可判定不等于类型错误，存在即通过（destinations 为空即跳过 MISMATCH）。
        const destination =
          reference.destinationRef ??
          reference.destinationRefs?.[0] ??
          reference.destinationContainerType;
        const path = `${entry.path}/${reference.shortName}`;
        const anchor = { containerUuid: entry.container.uuid, definitionRef: reference.uuid };
        // 「未选目标」与有无工程上下文无关：必填仍报 ERROR，可选直接通过。
        if (!targetUuids.length) {
          if (!reference.isOptional)
            issues.push({
              severity: 'ERROR',
              path,
              reason: `必填跨模块引用未选择目标：${reference.shortName} → ${destination}`,
              anchor,
              ruleId: 'OUTPUT-EXTERNAL-REQUIRED',
            });
          continue;
        }
        for (const targetUuid of targetUuids) {
          if (!scope) {
            issues.push({
              severity: 'ERROR',
              path,
              reason: `跨模块引用需在工程上下文中导出，请改用工程级导出：${reference.shortName} → ${targetUuid.slice(0, 8)}`,
              anchor,
              ruleId: 'OUTPUT-EXTERNAL-NO-SCOPE',
            });
            continue;
          }
          const target = scope.containers.get(targetUuid);
          if (!target) {
            issues.push({
              severity: 'ERROR',
              path,
              reason: `跨模块引用目标不在当前工程内：${reference.shortName} → ${targetUuid.slice(0, 8)}`,
              anchor,
              ruleId: 'OUTPUT-EXTERNAL-DANGLING',
            });
            continue;
          }
          if (
            destinations.length &&
            (!target.definitionPath || !destinations.includes(target.definitionPath))
          ) {
            issues.push({
              severity: 'ERROR',
              path,
              reason: `跨模块引用目标类型不匹配：${reference.shortName} 需要 ${destinations.join(' | ')}，实际 ${target.label}（${target.definitionPath ?? '未知定义路径'}）`,
              anchor,
              ruleId: 'OUTPUT-EXTERNAL-MISMATCH',
            });
            continue;
          }
          // 版本漂移只提示不阻塞：路径仍可正确写出，工程版本一致性由工程级规则负责。
          if (target.moduleVersion !== config.version)
            issues.push({
              severity: 'WARNING',
              path,
              reason: `目标模块版本与工程不一致（路径仍可写，不阻塞）：${reference.shortName} → ${target.label}（CP ${target.moduleVersion}）`,
              anchor,
              ruleId: 'OUTPUT-EXTERNAL-VERSION-DRIFT',
            });
        }
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
