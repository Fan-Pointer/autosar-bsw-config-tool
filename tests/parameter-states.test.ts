import { describe, expect, it } from 'vitest';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { evaluateParameterStates } from '../src/core/constraint/ParameterStates';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';

/** G39 fixture: one required, one optional, one read-only parameter. */
function fixture(): {
  module: BswmdModule;
  manager: ConfigInstanceManager;
  config: ReturnType<ConfigInstanceManager['createFromBswmd']>;
  container: ReturnType<ConfigInstanceManager['createFromBswmd']>['containers'][number];
} {
  const module = new BswmdParser().parseFromJson(
    JSON.stringify({
      uuid: 'states-module',
      shortName: 'States',
      version: 'TEST-STATES-1',
      definitionPath: '/AUTOSAR/EcucDefs/States',
      multiplicity: { lower: 1, upper: 1 },
      references: [],
      containers: [
        {
          uuid: 'states-general',
          shortName: 'StatesGeneral',
          definitionPath: '/AUTOSAR/EcucDefs/States/StatesGeneral',
          multiplicity: { lower: 1, upper: 1 },
          description: 'state fixture',
          parameters: [
            {
              uuid: 'required-num',
              shortName: 'RequiredNum',
              type: 'INTEGER',
              min: 0,
              max: 10,
              isOptional: false,
            },
            {
              uuid: 'optional-text',
              shortName: 'OptionalText',
              type: 'STRING',
              isOptional: true,
            },
            {
              uuid: 'readonly-flag',
              shortName: 'ReadonlyFlag',
              type: 'BOOLEAN',
              isOptional: false,
              readOnly: true,
            },
          ],
          references: [],
          subContainers: [],
        },
      ],
    })
  );
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  return { module, manager, config, container: config.containers[0] };
}

describe('G39 parameter row states', () => {
  it('locks an optional parameter until the user ticks it', () => {
    const { module, config, container } = fixture();
    const states = evaluateParameterStates(config, module, container.uuid);
    const optional = states.find((state) => state.definitionRef === 'optional-text');
    expect(optional).toMatchObject({
      disabled: true,
      notice: '可选参数未勾选：勾选后才能编辑',
      containerUuid: container.uuid,
    });
  });

  it('releases the optional parameter once confirmed and never locks required defaults', () => {
    const { module, manager, config, container } = fixture();
    manager.setParameterValue(container, 'optional-text', 'chosen');
    const states = evaluateParameterStates(config, module, container.uuid);
    expect(states.some((state) => state.definitionRef === 'optional-text')).toBe(false);
    // 默认值即配置（2026-11-09 裁定）：必填参数即使未确认也不锁定。
    expect(states.some((state) => state.definitionRef === 'required-num')).toBe(false);
  });

  it('locks a definition-declared read-only parameter with an XML notice', () => {
    const { module, config, container } = fixture();
    const states = evaluateParameterStates(config, module, container.uuid);
    expect(states.find((state) => state.definitionRef === 'readonly-flag')).toMatchObject({
      disabled: true,
      notice: '定义声明只读（来自 XML）',
    });
  });

  it('scopes evaluation to the requested container and accepts module-declared rules', () => {
    const { module, config, container } = fixture();
    const all = evaluateParameterStates(config, module);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((state) => state.containerUuid === container.uuid)).toBe(true);
    // 模块规则通道：声明依赖禁用时由规则提供原因（本期官方数据无 ENABLE-CONDITION）。
    const ruled = evaluateParameterStates(config, module, container.uuid, [
      {
        id: 'TEST-RULE',
        name: '测试规则',
        check: ({ definitionRef }) =>
          definitionRef === 'required-num'
            ? {
                definitionRef,
                containerUuid: container.uuid,
                disabled: true,
                notice: '需先打开前置开关',
              }
            : undefined,
      },
    ]);
    expect(ruled.find((state) => state.definitionRef === 'required-num')?.notice).toBe(
      '需先打开前置开关'
    );
  });
});
