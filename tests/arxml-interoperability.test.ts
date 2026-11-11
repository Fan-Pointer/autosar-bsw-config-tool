import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { collectContainers } from '../src/core/config/ConfigTraversal';
import {
  resolveReferenceCandidates,
  referenceDefinitionDest,
} from '../src/core/config/ReferenceCandidates';
import { exportArxml, importArxml, AUTOSAR_NAMESPACE } from '../src/core/io/Arxml';
import { exportCsv } from '../src/core/io/Csv';
import { serializeConfig } from '../src/core/io/ConfigJson';
import { evaluateOutputReadiness } from '../src/core/output/OutputGate';
import { useConfigStore } from '../src/stores/configStore';
import DynamicForm from '../src/ui/FormEditor/DynamicForm.vue';
import ImportDialog from '../src/ui/ImportExport/ImportDialog.vue';

vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async (_key: string, value: unknown) => value),
    }),
  },
}));
const wrappers: VueWrapper[] = [];
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});

function sample() {
  const prefix = '/AUTOSAR/EcucDefs/Interop';
  const leaf = (name: string): BswmdContainer => ({
    uuid: name,
    shortName: name,
    definitionPath: `${prefix}/${name}`,
    multiplicity: { lower: 1, upper: 1 },
    parameters: [],
    references: [],
    subContainers: [],
  });
  const root = leaf('Root');
  root.description = 'Root <description>';
  root.parameters = [
    {
      uuid: 'z',
      shortName: 'ZText',
      type: 'STRING',
      configClass: 'PRE_COMPILE',
      isOptional: false,
    },
    {
      uuid: 'a',
      shortName: 'ANumber',
      type: 'INTEGER',
      configClass: 'PRE_COMPILE',
      isOptional: false,
    },
    {
      uuid: 'm',
      shortName: 'MBoolean',
      type: 'BOOLEAN',
      configClass: 'PRE_COMPILE',
      isOptional: false,
    },
    {
      uuid: 'disabled',
      shortName: 'Disabled',
      type: 'STRING',
      configClass: 'PRE_COMPILE',
      isOptional: true,
    },
    {
      uuid: 'suggestion',
      shortName: 'Suggestion',
      type: 'STRING',
      configClass: 'PRE_COMPILE',
      isOptional: true,
      defaultValue: 'unconfirmed',
    },
  ];
  root.references = [
    {
      uuid: 'choice',
      shortName: 'ZChoice',
      kind: 'choice',
      destinationRefs: [`${prefix}/A`, `${prefix}/B`],
      destinationRef: `${prefix}/A`,
      destinationContainerType: 'A',
      isOptional: false,
    },
    {
      uuid: 'plain',
      shortName: 'APlain',
      kind: 'reference',
      destinationRef: `${prefix}/A`,
      destinationContainerType: 'A',
      isOptional: true,
    },
    { uuid: 'empty', shortName: 'Empty', destinationContainerType: 'A', isOptional: true },
  ];
  const module: BswmdModule = {
    shortName: 'Interop',
    version: '4.4.0',
    containers: [root, leaf('A'), leaf('B')],
  };
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  const instance = config.containers[0];
  manager.setParameterValue(instance, 'z', 'A & <B>');
  manager.setParameterValue(instance, 'a', 0);
  manager.setParameterValue(instance, 'm', false);
  manager.setParameterValue(instance, 'disabled', undefined);
  instance.parameters.get('z')!.description = 'Custom & description';
  manager.setReferenceTarget(instance, 'choice', config.containers[2].uuid);
  manager.setReferenceTarget(instance, 'plain', config.containers[1].uuid);
  instance.references.get('empty')!.isConfigured = true;
  config.name = '互操作样例';
  config.createdAt = 100;
  config.lastModified = 200;
  return { module, config, instance, manager, root };
}

describe('TASK-015 ARXML interoperation', () => {
  it('uses r4.0 and reports legacy r4.2.2 compatibility without changing the loaded release', () => {
    const { config, module } = sample();
    const xml = exportArxml(config, module);
    expect(AUTOSAR_NAMESPACE).toBe('http://autosar.org/schema/r4.0');
    const warn = vi.fn();
    expect(importArxml(xml, [module], warn).version).toBe('4.4.0');
    expect(warn).not.toHaveBeenCalled();
    const restored = importArxml(
      xml.replace(AUTOSAR_NAMESPACE, 'http://autosar.org/schema/r4.2.2'),
      [module],
      warn
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('来源为旧版本命名空间'));
    expect(restored.version).toBe('4.4.0');
    expect(exportArxml(restored, module)).toContain(`xmlns="${AUTOSAR_NAMESPACE}"`);
    expect(() => importArxml(xml.replace(/AUTOSAR(?= xmlns|>)/g, 'OTHER'), [module])).toThrow(
      '缺少 AUTOSAR 根节点'
    );
  });

  it('selects the second CHOICE-REFERENCE candidate, validates it, and round-trips its classified DEST', () => {
    const { config, module, root } = sample();
    expect(
      resolveReferenceCandidates(root.references[0], config, module).map(
        (e) => e.definition.shortName
      )
    ).toEqual(['A', 'B']);
    expect(evaluateOutputReadiness(config, module).ready).toBe(true);
    const xml = exportArxml(config, module);
    expect(xml).toContain('DEFINITION-REF DEST="ECUC-CHOICE-REFERENCE-DEF"');
    expect(xml).toContain('DEFINITION-REF DEST="ECUC-REFERENCE-DEF"');
    const restored = importArxml(xml, [module]);
    expect(restored.containers[0].references.get('choice')!.targetUuid).toBe(
      config.containers[2].uuid
    );
    expect(evaluateOutputReadiness(restored, module).ready).toBe(true);
    restored.containers[0].references.get('choice')!.targetUuid = restored.containers[0].uuid;
    expect(
      evaluateOutputReadiness(restored, module).issues.some(
        (i) => i.anchor.definitionRef === 'choice'
      )
    ).toBe(true);
  });

  it('round-trips every field/state/description/container UUID/timestamp in nonalphabetic definition order', () => {
    const { config, module, instance, root } = sample();
    // Imported/editor Maps can have another insertion order: the documented policy is definition order.
    instance.parameters = new Map([...instance.parameters].reverse());
    instance.references = new Map([...instance.references].reverse());
    const before = serializeConfig(config);
    const xml = exportArxml(config, module);
    expect(xml.indexOf('/ZText</DEFINITION-REF>')).toBeLessThan(
      xml.indexOf('/ANumber</DEFINITION-REF>')
    );
    expect(xml.indexOf('/ZChoice</DEFINITION-REF>')).toBeLessThan(
      xml.indexOf('/APlain</DEFINITION-REF>')
    );
    const restored = importArxml(xml, [module]);
    expect([...restored.containers[0].parameters.keys()]).toEqual(
      root.parameters.map((p) => p.uuid)
    );
    expect([...restored.containers[0].references.keys()]).toEqual(
      root.references.map((r) => r.uuid)
    );
    const parameterOrder = root.parameters.map((p) => p.uuid),
      referenceOrder = root.references.map((r) => r.uuid);
    before.containers[0].parameters.sort(
      (a, b) => parameterOrder.indexOf(a.definitionRef) - parameterOrder.indexOf(b.definitionRef)
    );
    before.containers[0].references.sort(
      (a, b) => referenceOrder.indexOf(a.definitionRef) - referenceOrder.indexOf(b.definitionRef)
    );
    expect(serializeConfig(restored)).toEqual(before);
    expect(serializeConfig(importArxml(exportArxml(restored, module), [module]))).toEqual(before);
    const noPrivate = importArxml(xml.replace(/<ADMIN-DATA>.*?<\/ADMIN-DATA>/g, ''), [module]);
    expect(noPrivate.containers[0].parameters.get('z')!.value).toBe('A & <B>');
    expect(noPrivate.containers[0].parameters.get('a')!.value).toBe(0);
    expect(noPrivate.containers[0].parameters.get('m')!.value).toBe(false);
    expect(noPrivate.containers[0].references.get('choice')!.targetUuid).toBe(
      config.containers[2].uuid
    );
    expect([...noPrivate.containers[0].parameters.keys()]).toEqual(parameterOrder);
    const textValue = xml
      .match(/<ECUC-TEXTUAL-PARAM-VALUE.*?<\/ECUC-TEXTUAL-PARAM-VALUE>/)![0]
      .replace(/ UUID="[^"]*"/, '');
    expect(() =>
      importArxml(xml.replace('</PARAMETER-VALUES>', textValue + '</PARAMETER-VALUES>'), [module])
    ).toThrow('参数 definitionRef 未知或重复');
  });

  it.each(['foreign', 'instance'] as const)(
    'classifies %s definitions but rejects unsupported external values instead of fabricating local references',
    (kind) => {
      const { config, module, root } = sample();
      const ref = root.references[0];
      ref.kind = kind;
      ref.isExternal = true;
      expect(referenceDefinitionDest(ref)).toBe(`ECUC-${kind.toUpperCase()}-REFERENCE-DEF`);
      expect(resolveReferenceCandidates(ref, config, module)).toEqual([]);
      // 已选目标但当前没有工程上下文：只能给出 NO-SCOPE，不会伪造本地目标。
      expect(() => exportArxml(config, module)).toThrow('跨模块引用需在工程上下文中导出');
      const wrapper = mount(DynamicForm, {
        props: { container: root },
        global: { plugins: [ElementPlus] },
      });
      wrappers.push(wrapper);
      // 跨模块引用已可选择：选择器不再禁用，提示语改为工程内目标说明。
      expect(
        wrapper.get('button[aria-label="选择 ZChoice"]').attributes('disabled')
      ).toBeUndefined();
      expect(wrapper.text()).toContain('跨模块引用：目标需在本工程其它模块中选择');
    }
  );

  it('rejects instance-reference values with context chains without silently dropping them', () => {
    const { config, module } = sample();
    const xml = exportArxml(config, module).replace(
      /ECUC-REFERENCE-VALUE/g,
      'ECUC-INSTANCE-REFERENCE-VALUE'
    );
    expect(() => importArxml(xml, [module])).toThrow('实例引用含上下文目标');
  });

  it('explicitly rejects DTC CSV for a valid non-DTC module', () => {
    const { config, module } = sample();
    expect(evaluateOutputReadiness(config, module).ready).toBe(true);
    expect(() => exportCsv(config, module)).toThrow('此模块未定义 DTC CSV 导出字段');
  });

  it('binds store output checks to UUID, timestamp and edit revision; candidates include the second definition', async () => {
    const { module } = sample();
    const store = useConfigStore();
    await store.importModuleDefinitions([module]);
    await store.createConfigSet('候选', 'Interop');
    const root = store.config!.containers[0];
    expect(store.referenceOptions.choice).toHaveLength(2);
    expect(store.referenceAddOptions.choice.map((item) => item.definitionUuid)).toEqual(['A', 'B']);
    store.setReferenceTarget('choice', store.config!.containers[2].uuid);
    expect(store.referenceData.choice).toBe(store.config!.containers[2].uuid);
    const check = store.getOutputCheck();
    expect(check).toMatchObject({
      configUuid: store.activeUuid,
      lastModified: store.config!.lastModified,
    });
    store.validate(check);
    const frozen = store.config!.lastModified;
    store.setParameterValue('z', 'new value');
    store.config!.lastModified = frozen; // two edits within one timer tick must still be detected
    expect(() => store.validate(check)).toThrow('输出检查已过期');
    const newer = store.getOutputCheck();
    expect(() => store.validate({ ...newer, configUuid: 'other' })).toThrow('不属于当前模块配置');
    expect(() => store.validate({ ...newer, lastModified: newer.lastModified - 1 })).toThrow(
      '输出检查已过期'
    );
    expect(store.selectedEntry!.container.uuid).toBe(root.uuid);
    const loaded = store.modules.find((m) => m.shortName === 'Interop')!;
    loaded.containers[0].references[0].isExternal = true;
    // 该配置集不属于任何工程 → 无工程上下文，跨模块候选恒为空（裁定 B）。
    expect(store.referenceOptions.choice).toEqual([]);
    expect(store.referenceAddOptions.choice).toEqual([]);
    // 清空引用永远允许（此前外部引用连清空都被拒绝）。
    expect(() => store.setReferenceTarget('choice', '')).not.toThrow();
    expect(store.referenceData.choice).toBe('');
  });

  it('propagates the legacy warning to the real import dialog before applying the file', async () => {
    const { module, config } = sample();
    const store = useConfigStore();
    await store.importModuleDefinitions([module]);
    await store.createConfigSet('导入预览', 'Interop');
    const text = exportArxml(config, module).replace(
      AUTOSAR_NAMESPACE,
      'http://autosar.org/schema/r4.2.2'
    );
    expect(store.prepareImport(text, 'arxml').warnings?.[0]).toContain('来源为旧版本命名空间');
    const wrapper = mount(ImportDialog, {
      props: { modelValue: true, format: 'arxml' },
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(wrapper);
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="配置文件"]')!;
    Object.defineProperty(input, 'files', {
      value: [new File([text], 'old.arxml', { type: 'text/xml' })],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('.el-alert--warning')?.textContent).toContain(
        '来源为旧版本命名空间'
      )
    );
    expect(document.body.textContent).toContain('应用导入');
  });

  it('uses the official Dem second memory destination without changing its definition', () => {
    const store = useConfigStore();
    store.createConfig();
    const root = store.entries.find((e) => e.definition.shortName === 'DemConfigSet')!;
    const attrDef = root.definition.subContainers.find((d) => d.shortName === 'DemDTCAttributes')!;
    const attr = store.addContainerInstance(attrDef.uuid, root.container.uuid)!;
    const ref = attrDef.references.find((r) => r.shortName === 'DemMemoryDestinationRef')!;
    const second = store.entries.find(
      (e) => e.definition.definitionPath === ref.destinationRefs![1]
    )!;
    expect(second.definition.shortName).toBe('DemPrimaryMemory');
    expect(
      store.referenceOptions[ref.uuid].some((option) => option.uuid === second.container.uuid)
    ).toBe(true);
    store.setReferenceTarget(ref.uuid, second.container.uuid);
    expect(attr.references.get(ref.uuid)!.targetUuid).toBe(second.container.uuid);
    expect(
      store
        .getOutputCheck()
        .issues.filter(
          (i) => i.anchor.containerUuid === attr.uuid && i.anchor.definitionRef === ref.uuid
        )
    ).toEqual([]);
    expect(
      collectContainers(store.config!, store.module!).some(
        (e) => e.container.uuid === second.container.uuid
      )
    ).toBe(true);
  });
});
