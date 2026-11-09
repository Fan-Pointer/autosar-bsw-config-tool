import { describe, expect, it } from 'vitest';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import { ConfigInstanceManager } from '../src/core/config/ConfigInstance';
import { exportProjectArxml } from '../src/core/io/Arxml';
import { buildProjectPackage } from '../src/core/io/ProjectPackage';
import { buildZip, crc32 } from '../src/core/io/Zip';

/** 构造一个可导出的小模块（单容器、单必填 INTEGER 参数）。 */
function moduleFixture(shortName: string, uuid: string) {
  const module = new BswmdParser().parseFromJson(
    JSON.stringify({
      uuid: `${uuid}-module`,
      shortName,
      version: 'TEST-4.4.0',
      definitionPath: `/AUTOSAR/EcucDefs/${shortName}`,
      multiplicity: { lower: 1, upper: 1 },
      references: [],
      containers: [
        {
          uuid: `${uuid}-general`,
          shortName: `${shortName}General`,
          definitionPath: `/AUTOSAR/EcucDefs/${shortName}/${shortName}General`,
          multiplicity: { lower: 1, upper: 1 },
          parameters: [
            {
              uuid: `${uuid}-dev`,
              shortName: 'DevErrorDetect',
              type: 'BOOLEAN',
              isOptional: false,
              defaultValue: false,
            },
            {
              // 必填且无默认值：用于验证闸门拒绝路径。
              uuid: `${uuid}-num`,
              shortName: 'MaxEntries',
              type: 'INTEGER',
              min: 1,
              max: 100,
              isOptional: false,
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
  return { module, manager, config };
}

describe('G44 project package', () => {
  it('merges several modules into one ARXML document with a single root', () => {
    const a = moduleFixture('Alpha', 'alpha');
    const b = moduleFixture('Beta', 'beta');
    const xml = exportProjectArxml([
      { config: a.config, module: a.module },
      { config: b.config, module: b.module },
    ]);
    expect((xml.match(/<AUTOSAR /g) ?? []).length).toBe(1);
    expect((xml.match(/ECUC-MODULE-CONFIGURATION-VALUES/g) ?? []).length).toBe(4); // 2 开 + 2 闭
    expect(xml).toContain('<SHORT-NAME>Alpha</SHORT-NAME>');
    expect(xml).toContain('<SHORT-NAME>Beta</SHORT-NAME>');
  });

  it('rejects the whole document when one module fails its output gate', () => {
    const a = moduleFixture('Alpha', 'alpha');
    const b = moduleFixture('Beta', 'beta');
    // 制造未就绪：清掉必填参数的值并标记显式禁用。
    b.config.containers[0].parameters.get('beta-num')!.value = undefined;
    b.config.containers[0].parameters.get('beta-num')!.isConfigured = true;
    expect(() =>
      exportProjectArxml([
        { config: a.config, module: a.module },
        { config: b.config, module: b.module },
      ])
    ).toThrow(/Beta/);
  });

  it('writes a readable zip with manifest, module ARXML and code entries', async () => {
    const a = moduleFixture('Alpha', 'alpha');
    const { zip, manifest } = await buildProjectPackage({
      projectName: '车身控制器',
      autosarVersion: '4.4.0',
      chip: 'S32K3XX',
      entries: [{ config: a.config, module: a.module }],
    });
    // ZIP 签名 + EOCD 条目数
    expect(String.fromCharCode(...zip.slice(0, 2))).toBe('PK');
    const tail = zip.slice(zip.length - 22);
    expect(new DataView(tail.buffer, tail.byteOffset, tail.byteLength).getUint32(0, true)).toBe(
      0x06054b50
    );
    expect(
      new DataView(tail.buffer, tail.byteOffset, tail.byteLength).getUint16(10, true)
    ).toBeGreaterThanOrEqual(3); // project.arxml + modules/Alpha.arxml + manifest.json (+ code 视闸门)
    expect(manifest.modules.map((item) => item.module)).toEqual(['Alpha']);
    // 包内文件名以 UTF-8 明文存储，可直接检索
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('project.arxml');
    expect(text).toContain('modules/Alpha.arxml');
    expect(text).toContain('manifest.json');
  });

  it('computes the standard CRC-32 for a known input', () => {
    // 已知向量："123456789" -> 0xCBF43926
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(buildZip([{ path: 'a.txt', content: 'x' }], new Date('2026-11-09T12:00:00Z')).length).toBeGreaterThan(60);
  });
});
