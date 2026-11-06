import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { writeModuleArtifact } from './bswmd-artifacts.mjs';

const groups = {
  诊断服务: ['Dem', 'Dcm', 'Det', 'FiM', 'Dlt', 'DoIP', 'J1939Dcm'],
  存储服务: ['NvM', 'MemIf', 'Fee', 'Ea', 'MemMap'],
  系统服务: ['BswM', 'EcuM', 'EcuC', 'Os', 'StbM', 'Tm', 'WdgM', 'WdgIf', 'Rte'],
  安全与加密: ['Csm', 'CryIf', 'Crypto', 'SecOC', 'KeyM', 'Idsm'],
  微控制器与驱动: [
    'Adc',
    'Can',
    'CanTrcv',
    'Dio',
    'Eth',
    'EthTrcv',
    'Fls',
    'FlsTst',
    'Gpt',
    'Icu',
    'Lin',
    'LinTrcv',
    'Mcu',
    'Ocu',
    'Port',
    'Pwm',
    'Spi',
    'Wdg',
    'Eep',
    'Fr',
    'FrTrcv',
  ],
};
function group(name) {
  return (
    Object.entries(groups).find(([, names]) => names.includes(name))?.[0] ??
    (/^(Can|Com|Pdu|Lin|Fr|Eth|SoAd|TcpIp|Udp|Nm|Ipdu|J1939|Xcp|SomeIp)/.test(name)
      ? '通信服务'
      : '其他标准模块')
  );
}
function batch(reason) {
  return /SYMBOLIC/.test(reason)
    ? 'B2-SYMBOLIC'
    : /ADD-INFO/.test(reason)
      ? 'B2-ADD-INFO'
      : /MULTILINE/.test(reason)
        ? 'B2-MULTILINE'
        : /URI-REFERENCE/.test(reason)
          ? 'B2-URI'
          : /LINKER-SYMBOL/.test(reason)
            ? 'B2-LINKER'
            : 'B2-DEFINITION';
}
const flat = (list) => list.flatMap((c) => [c, ...flat(c.subContainers)]);

/** Generate a complete per-release catalog, preserving unsupported entries with diagnostics.
 * @param {string} source Official local ARXML. @param {string} directory Asset output directory.
 * @returns {Promise<void>} Nothing; writes deterministic assets and catalog.json.
 */
export async function generateCatalog(source, directory) {
  const bytes = readFileSync(source),
    text = bytes.toString('utf8');
  const release =
    text.match(/Part of AUTOSAR Release:\s*(\d+\.\d+\.\d+)/)?.[1] ??
    text.match(/AUTOSAR_(\d+-\d+-\d+)\.xsd/)?.[1].replaceAll('-', '.');
  if (!['4.2.2', '4.4.0'].includes(release)) throw new Error('无法从源内容确认支持的发布版本');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });
  try {
    const importer = await server.ssrLoadModule('/src/core/bswmd/EcucArxmlImporter.ts');
    const { BswmdParser } = await server.ssrLoadModule('/src/core/bswmd/BswmdParser.ts');
    const { ConfigInstanceManager } = await server.ssrLoadModule(
      '/src/core/config/ConfigInstance.ts'
    );
    const json = await server.ssrLoadModule('/src/core/io/ConfigJson.ts');
    const arxml = await server.ssrLoadModule('/src/core/io/Arxml.ts');
    const { evaluateOutputReadiness } = await server.ssrLoadModule(
      '/src/core/output/OutputGate.ts'
    );
    const { CGenerator } = await server.ssrLoadModule('/src/core/generator/CGenerator.ts');
    const entries = [];
    mkdirSync(directory, { recursive: true });
    for (const name of importer.listEcucModuleNames(text)) {
      const row = {
        shortName: name,
        release,
        group: group(name),
        asset: null,
        contentSha256: null,
        status: 'unsupported',
        parsed: false,
        reason: '',
        batch: null,
        diagnostics: [],
        verification: null,
      };
      try {
        const parsed = importer.importEcucModuleArxml(text, name);
        if (parsed.version !== release)
          throw new Error(`模块版本 ${parsed.version} 与源发布版本 ${release} 不符`);
        row.parsed = true;
        const output = resolve(directory, `${name.toLowerCase()}_bswmd.json`);
        const artifact = writeModuleArtifact(parsed, source, output);
        row.asset = basename(output);
        row.contentSha256 = artifact.$source.contentSha256;
        const definition = new BswmdParser().parseFromJson(JSON.stringify(artifact));
        const fields = flat(definition.containers);
        row.diagnostics = fields.flatMap((c) =>
          c.parameters
            .filter((p) => p.definitionIssue)
            .map((p) => `${p.shortName}：${p.definitionIssue}`)
        );
        // New symbolic support is generic. Non-Dem 4.2.2 qualification remains the separately
        // scheduled B2 batch; parsing alone must not silently label those modules qualified.
        if (
          release === '4.2.2' &&
          name !== 'Dem' &&
          fields.some((c) => c.references.some((r) => r.kind === 'symbolic'))
        ) {
          row.reason = '定义已解析；符号名引用的全模块验证待 B2-SYMBOLIC 批次完成';
          row.batch = 'B2-SYMBOLIC';
        } else {
          const manager = new ConfigInstanceManager([definition]);
          const config = manager.createFromBswmd(definition);
          const roundtrip = json.importJson(json.exportJson(config), [definition]);
          if (json.exportJson(roundtrip) !== json.exportJson(config))
            throw new Error('JSON 往返不一致');
          const check = evaluateOutputReadiness(config, definition);
          const generator = new CGenerator();
          if (check.ready) {
            arxml.importArxml(arxml.exportArxml(config, definition), [definition]);
            await generator.generateHeader(config, definition);
            await generator.generateSource(config, definition);
          } else {
            let refused = 0;
            try {
              arxml.exportArxml(config, definition);
            } catch {
              refused++;
            }
            try {
              await generator.generateHeader(config, definition);
            } catch {
              refused++;
            }
            try {
              await generator.generateSource(config, definition);
            } catch {
              refused++;
            }
            if (refused !== 3) throw new Error('输出闸门与导出/生成不一致');
          }
          row.verification = {
            creation: true,
            jsonRoundtrip: true,
            validation: true,
            arxml: check.ready ? 'roundtrip' : 'expected-rejection',
            cGeneration: check.ready ? 'generated' : 'expected-rejection',
          };
          const limitations = [];
          if (fields.some((c) => c.parameters.some((p) => p.vendorSpecific)))
            limitations.push('含供应商/硬件特定字段，只读且需要补充定义');
          if (fields.some((c) => c.references.some((r) => r.isExternal)))
            limitations.push('跨模块引用当前只读，配置后输出按校验结果放行');
          if ((parsed.importWarnings ?? []).some((w) => w.includes('多值')))
            limitations.push('多值字段当前仅编辑单值');
          row.status = limitations.length ? 'limited' : 'available';
          row.reason = limitations.join('；');
        }
      } catch (error) {
        row.reason = error instanceof Error ? error.message : String(error);
        row.batch = batch(row.reason);
      }
      entries.push(row);
    }
    const manifest = {
      format: 'onesar-module-catalog/1',
      release,
      source: {
        file: basename(source),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length,
      },
      entries,
    };
    writeFileSync(resolve(directory, 'catalog.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(
      `${release}: ${entries.length} modules; ${entries.filter((r) => r.parsed).length} parsed; ${entries.filter((r) => r.status !== 'unsupported').length} selectable`
    );
    for (const row of entries.filter(
      (r) => r.status === 'unsupported' && r.batch !== 'B2-SYMBOLIC'
    ))
      console.log(`${row.shortName}: ${row.reason}`);
  } finally {
    await server.close();
  }
}
