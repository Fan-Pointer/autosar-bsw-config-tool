/**
 * 从 AUTOSAR 官方 ECUC 参数定义 ARXML 生成内部 BSWMD JSON。
 *
 * 用法：node scripts/gen-bswmd-from-arxml.mjs <模块名> [输出路径]
 * 默认输入：../../AUTOSAR_MOD_ECUConfigurationParameters.arxml（项目外一层）
 *
 * 生成物携带溯源元数据，便于日后核对来源与版本。
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_SOURCE = resolve(ROOT, '..', 'AUTOSAR_MOD_ECUConfigurationParameters.arxml');

const moduleName = process.argv[2] ?? 'Dem';
const source =
  process.argv[3] && !process.argv[3].endsWith('.json') ? process.argv[3] : DEFAULT_SOURCE;
const output = process.argv[4] ?? resolve(ROOT, 'bswmd', `${moduleName.toLowerCase()}_bswmd.json`);

/** 描述裁剪上限：官方 DESC 含大量规范引用文本，界面只用于提示，保留首段足够。 */
const DESC_LIMIT = 160;

function trim(text) {
  if (typeof text !== 'string') return text;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= DESC_LIMIT ? flat : `${flat.slice(0, DESC_LIMIT - 1)}…`;
}

function compact(container, parentPath) {
  const path = `${parentPath}/${container.shortName}`;
  return {
    ...(container.definitionPath ? { definitionPath: container.definitionPath } : {}),
    ...(container.choice ? { choice: container.choice } : {}),
    uuid: container.uuid,
    shortName: container.shortName,
    ...(container.description ? { description: trim(container.description) } : {}),
    multiplicity: container.multiplicity,
    parameters: (container.parameters ?? []).map((p) => ({
      ...p,
      definitionPath: `${path}/${p.shortName}`,
      ...(p.description ? { description: trim(p.description) } : {}),
    })),
    references: (container.references ?? []).map((r) => ({
      ...r,
      definitionPath: `${path}/${r.shortName}`,
      ...(r.description ? { description: trim(r.description) } : {}),
    })),
    subContainers: (container.subContainers ?? []).map((c) => compact(c, path)),
  };
}

const raw = readFileSync(source, 'utf8');
const { importEcucModuleArxml } = await import('../src/core/bswmd/EcucArxmlImporter.ts');
const module = importEcucModuleArxml(raw, moduleName);

const payload = {
  $source: {
    file: source.split(/[\\/]/).pop(),
    bytes: statSync(source).size,
    sha256: createHash('sha256').update(raw).digest('hex'),
    generator: 'scripts/gen-bswmd-from-arxml.mjs',
    generatedAt: new Date().toISOString(),
    descriptionLimit: DESC_LIMIT,
  },
  shortName: module.shortName,
  version: module.version,
  ...(module.description ? { description: trim(module.description) } : {}),
  containers: module.containers.map((c) => compact(c, "/AUTOSAR/EcucDefs/" + module.shortName)),
};

writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const count = (list) =>
  list.reduce((n, c) => n + 1 + count(c.subContainers), 0);
const params = (list) =>
  list.reduce((n, c) => n + c.parameters.length + params(c.subContainers), 0);
const refs = (list) =>
  list.reduce((n, c) => n + c.references.length + refs(c.subContainers), 0);

console.log(
  `[gen] ${moduleName} → ${output}\n` +
    `      容器 ${count(module.containers)} | 参数 ${params(module.containers)} | 引用 ${refs(module.containers)} | ` +
    `体积 ${(statSync(output).size / 1024).toFixed(0)} KB`
);
