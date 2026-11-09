import { describe, expect, it } from 'vitest';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { referenceTargets } from '../src/core/config/ConfigTypes';
import { exportArxml, importArxml } from '../src/core/io/Arxml';
import { exportJson, importJson } from '../src/core/io/ConfigJson';

/** G42 fixture：Root 下两个 List 子容器 + 一个多值引用（upper 3）。 */
function fixture() {
  const module = new BswmdParser().parseFromJson(
    JSON.stringify({
      uuid: 'multi-ref-module',
      shortName: 'MultiRef',
      version: 'TEST-REF-1',
      definitionPath: '/AUTOSAR/EcucDefs/MultiRef',
      multiplicity: { lower: 1, upper: 1 },
      references: [],
      containers: [
        {
          uuid: 'multi-ref-root',
          shortName: 'MultiRefRoot',
          definitionPath: '/AUTOSAR/EcucDefs/MultiRef/MultiRefRoot',
          multiplicity: { lower: 1, upper: 1 },
          description: 'root',
          parameters: [],
          references: [
            {
              uuid: 'multi-ref-targets',
              shortName: 'MultiRefTargets',
              definitionPath: '/AUTOSAR/EcucDefs/MultiRef/MultiRefRoot/MultiRefTargets',
              isOptional: false,
              multiplicity: { lower: 0, upper: 3 },
              destinationContainerType: 'MultiRefList',
              destinationRef: '/AUTOSAR/EcucDefs/MultiRef/MultiRefRoot/MultiRefList',
            },
          ],
          subContainers: [
            {
              uuid: 'multi-ref-list',
              shortName: 'MultiRefList',
              definitionPath: '/AUTOSAR/EcucDefs/MultiRef/MultiRefRoot/MultiRefList',
              multiplicity: { lower: 0, upper: 5 },
              description: 'list',
              parameters: [],
              references: [],
              subContainers: [],
            },
          ],
        },
      ],
    })
  );
  const manager = new ConfigInstanceManager([module]);
  const config = manager.createFromBswmd(module);
  const root = config.containers[0];
  const targetA = manager.addContainerInstance(config, root.uuid, 'multi-ref-list');
  const targetB = manager.addContainerInstance(config, root.uuid, 'multi-ref-list');
  return { module, manager, config, root, targetA, targetB };
}

describe('G42 multi-value references', () => {
  it('appends targets within the definition upper bound and removes by index', () => {
    const { manager, config, root, targetA, targetB } = fixture();
    expect(manager.addReferenceTarget(root, 'multi-ref-targets', targetA.uuid, 3)).toBe(1);
    expect(manager.addReferenceTarget(root, 'multi-ref-targets', targetB.uuid, 3)).toBe(2);
    const value = root.references.get('multi-ref-targets')!;
    expect(referenceTargets(value)).toEqual([targetA.uuid, targetB.uuid]);
    expect(value.targetUuid).toBe(targetA.uuid);
    expect(value.isConfigured).toBe(true);
    // 第三目标仍在界内，第四目标超出 upper=3。
    const targetC = manager.addContainerInstance(config, root.uuid, 'multi-ref-list');
    expect(manager.addReferenceTarget(root, 'multi-ref-targets', targetC.uuid, 3)).toBe(3);
    expect(() => manager.addReferenceTarget(root, 'multi-ref-targets', targetC.uuid, 3)).toThrow(
      '最多 3 个目标'
    );
    // 删中间项后兼容字段同步为剩余首项。
    expect(manager.removeReferenceTarget(root, 'multi-ref-targets', 0)).toBe(2);
    expect(referenceTargets(root.references.get('multi-ref-targets')!)).toEqual([
      targetB.uuid,
      targetC.uuid,
    ]);
    expect(root.references.get('multi-ref-targets')!.targetUuid).toBe(targetB.uuid);
  });

  it('round-trips multiple targets through ARXML and JSON without loss', () => {
    const { manager, module, config, root, targetA, targetB } = fixture();
    manager.addReferenceTarget(root, 'multi-ref-targets', targetA.uuid, 3);
    manager.addReferenceTarget(root, 'multi-ref-targets', targetB.uuid, 3);
    const xml = exportArxml(config, module);
    // 每个目标一条 ECUC-REFERENCE-VALUE。
    expect((xml.match(/ECUC-REFERENCE-VALUE/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const fromXml = importArxml(xml, [module]);
    expect(referenceTargets(fromXml.containers[0].references.get('multi-ref-targets')!)).toEqual([
      targetA.uuid,
      targetB.uuid,
    ]);
    const fromJson = importJson(exportJson(config), [module]);
    expect(referenceTargets(fromJson.containers[0].references.get('multi-ref-targets')!)).toEqual([
      targetA.uuid,
      targetB.uuid,
    ]);
  });

  it('keeps single-target references in the legacy shape (no array)', () => {
    const { manager, module, config, root, targetA } = fixture();
    manager.setReferenceTarget(root, 'multi-ref-targets', targetA.uuid);
    expect(root.references.get('multi-ref-targets')!.targetUuids).toBeUndefined();
    const roundTripped = importArxml(exportArxml(config, module), [module]);
    expect(roundTripped.containers[0].references.get('multi-ref-targets')!.targetUuids).toBeUndefined();
  });
});
