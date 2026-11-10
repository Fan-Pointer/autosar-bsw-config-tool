import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { scanArxmlModules } from '../src/core/io/Arxml';

/** 用户实际反馈的两个样本（本机存在才跑，CI 自动跳过）。 */
const CANIF = 'D:/TencentApp/GoogleDownLoad/CanIf.arxml';
const PROJECT = 'D:/TencentApp/GoogleDownLoad/ZZ_调研测试_DEL.arxml';

describe('G45 ARXML module scanning', () => {
  it.skipIf(!existsSync(CANIF))('recognises a single-module file (CanIf)', () => {
    const headers = scanArxmlModules(readFileSync(CANIF, 'utf8'));
    expect(headers).toHaveLength(1);
    expect(headers[0].shortName).toBe('CanIf');
    expect(headers[0].definitionPath).toBe('/AUTOSAR/CanIf');
    // `-REF` 变体不能被当成模块段
    expect(headers.every((item) => !item.shortName.includes('REF'))).toBe(true);
  });

  it.skipIf(!existsSync(PROJECT))('enumerates every module of a project-level file', () => {
    const headers = scanArxmlModules(readFileSync(PROJECT, 'utf8'));
    expect(headers.length).toBeGreaterThan(1);
    const names = headers.map((item) => item.shortName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Dem');
    for (const header of headers) {
      expect(header.definitionPath.startsWith('/AUTOSAR/')).toBe(true);
      expect(header.release).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('rejects a file without module configuration', () => {
    expect(() => scanArxmlModules('<AUTOSAR xmlns="http://autosar.org/schema/r4.0"></AUTOSAR>')).toThrow(
      '没有可导入的 ECUC 模块配置'
    );
  });
});
