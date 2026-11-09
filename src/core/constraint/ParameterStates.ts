import type { ConfigInstance } from '@/core/config/ConfigTypes';
import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import { collectContainers } from '@/core/config/ConfigTraversal';

/** Disabled state + business notice for one parameter row (G39).
 * Mirrors the reference product's `parameterValidateVoList[{disable, notice}]`:
 * the row stays visible, its control is locked, and a Chinese notice explains why. */
export interface ParameterState {
  definitionRef: string;
  containerUuid: string;
  disabled: boolean;
  notice?: string;
}

/** Optional extension point so module rules can declare additional row states
 * (the reference product derives these from backend validation; we supply them
 * from declared rules only, never from invented defaults). */
export interface ParameterStateRule {
  id: string;
  name: string;
  check: (context: {
    config: ConfigInstance;
    module: BswmdModule;
    containerUuid: string;
    definitionRef: string;
  }) => ParameterState | undefined;
}

/**
 * Evaluate parameter row states for one container (or the whole configuration).
 *
 * Two authoritative sources only:
 * 1. Optional parameter not confirmed by the user → row locked until the checkbox is ticked
 *    (product spec §5.1: "可选参数未勾选 → 控件禁用；勾选后 → 控件解锁").
 * 2. Definition declares the parameter read-only → row locked with an XML-source notice.
 *
 * Official 4.2.2/4.4.4 ECU configuration parameters currently carry no
 * ENABLE-CONDITION-REF (verified: 0 occurrences in both source ARXML files), so no
 * dependency-driven disablement is fabricated; module rules may add states through
 * `rules` when a real condition is declared.
 *
 * @param config Live configuration.
 * @param module Matching definition.
 * @param containerUuid Restrict evaluation to one container instance (editor form scope).
 * @param rules Additional module-declared state rules.
 * @returns Row states keyed by parameter definition UUID.
 */
export function evaluateParameterStates(
  config: ConfigInstance,
  module: BswmdModule,
  containerUuid?: string,
  rules: readonly ParameterStateRule[] = []
): ParameterState[] {
  const states: ParameterState[] = [];
  for (const entry of collectContainers(config, module)) {
    if (containerUuid && entry.container.uuid !== containerUuid) continue;
    for (const parameter of entry.definition.parameters) {
      const stored = entry.container.parameters.get(parameter.uuid);
      const configured = stored?.isConfigured === true;
      if (parameter.isOptional && !configured) {
        states.push({
          definitionRef: parameter.uuid,
          containerUuid: entry.container.uuid,
          disabled: true,
          notice: '可选参数未勾选：勾选后才能编辑',
        });
        continue;
      }
      if (parameter.readOnly) {
        states.push({
          definitionRef: parameter.uuid,
          containerUuid: entry.container.uuid,
          disabled: true,
          notice: '定义声明只读（来自 XML）',
        });
        continue;
      }
      for (const rule of rules) {
        const state = rule.check({
          config,
          module,
          containerUuid: entry.container.uuid,
          definitionRef: parameter.uuid,
        });
        if (state) {
          states.push(state);
          break;
        }
      }
    }
  }
  return states;
}
