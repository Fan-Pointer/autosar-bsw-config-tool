/**
 * 从 AUTOSAR 官方 ECUC 参数定义 ARXML 生成内部 BSWMD JSON。
 *
 * 用法：node scripts/gen-bswmd-from-arxml.mjs <模块名> [来源.arxml] [输出.json]
 * 也支持 <模块名> <输出.json>，来源省略时使用仓库父目录的官方 4.4.0 文件。
 *
 * 生成物携带溯源元数据，便于日后核对来源与版本。
 */
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_SOURCE = resolve(ROOT, '..', 'AUTOSAR_MOD_ECUConfigurationParameters.arxml');

const moduleName = process.argv[2] ?? 'Dem';
const outputOnly = process.argv[3]?.endsWith('.json');
const source = resolve(outputOnly || !process.argv[3] ? DEFAULT_SOURCE : process.argv[3]);
const output = resolve(
  (outputOnly ? process.argv[3] : process.argv[4]) ??
    resolve(ROOT, 'bswmd', `${moduleName.toLowerCase()}_bswmd.json`)
);
if (!output.endsWith('.json') || source === output) throw new Error('输出须为独立 JSON 文件');

/** 描述裁剪上限：官方 DESC 含大量规范引用文本，界面只用于提示，保留首段足够。 */
const DESC_LIMIT = 160;

/**
 * CSV 导出语义角色（源自手写版 dem_bswmd.legacy.json，按 shortName + 容器上下文迁移）。
 * 官方 ARXML 无此编辑器扩展元数据，生成时在此处声明。
 */
const EXPORT_ROLES = [
  { container: 'DemDTC', shortName: 'DemDtcValue', role: 'dtcValue' },
  { container: 'DemDTC', shortName: 'DemDTCSeverity', role: 'severity' },
  { container: 'DemDTC', shortName: 'DemWWHOBDDTCClass', role: 'wwhObdClass' },
  { container: 'DemDTC', shortName: 'DemDTCAttributesRef', role: 'attributes' },
  { container: 'DemEventParameter', shortName: 'DemEventId', role: 'eventId' },
  { container: 'DemEventParameter', shortName: 'DemDTCRef', role: 'dtc' },
];

function roleOf(containerShortName, elementShortName) {
  return EXPORT_ROLES.find(
    (r) => r.container === containerShortName && r.shortName === elementShortName
  )?.role;
}

function trim(text) {
  if (typeof text !== 'string') return text;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= DESC_LIMIT ? flat : `${flat.slice(0, DESC_LIMIT - 1)}…`;
}

function compact(container, parentPath, containerName = container.shortName) {
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
      ...(roleOf(containerName, p.shortName)
        ? { exportRole: roleOf(containerName, p.shortName) }
        : {}),
      ...(p.description ? { description: trim(p.description) } : {}),
    })),
    references: (container.references ?? []).map((r) => ({
      ...r,
      definitionPath: `${path}/${r.shortName}`,
      ...(roleOf(containerName, r.shortName)
        ? { exportRole: roleOf(containerName, r.shortName) }
        : {}),
      ...(r.description ? { description: trim(r.description) } : {}),
    })),
    subContainers: (container.subContainers ?? []).map((c) => compact(c, path, c.shortName)),
  };
}

// Existing Vite resolves the core's TypeScript imports and @ alias on supported Node versions.
// Middleware mode with HMR/watch disabled creates no listening browser/server service.
const raw = readFileSync(source);
const loader = await createServer({
  root: ROOT,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
});
let module;
try {
  const { importEcucModuleArxml } = await loader.ssrLoadModule(
    '/src/core/bswmd/EcucArxmlImporter.ts'
  );
  module = importEcucModuleArxml(raw.toString('utf8'), moduleName);
} finally {
  await loader.close();
}
if (module.version !== '4.4.0')
  throw new Error(`本期抽取基线仅支持官方 CP 4.4.0，输入模块版本为 ${module.version}`);

// Sort object keys only. Definition arrays carry semantic order and must never be alphabetized.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
function json(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}
function hash(value) {
  return createHash('sha256').update(json(value)).digest('hex');
}
function content(value) {
  const { $source: _source, ...body } = value;
  return body;
}
function changes(before, after, path = '') {
  if (JSON.stringify(canonical(before)) === JSON.stringify(canonical(after))) return [];
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    [...before, ...after].every(
      (item) => item && typeof item === 'object' && typeof item.uuid === 'string'
    )
  ) {
    const oldItems = Object.fromEntries(before.map((item) => [item.uuid, item]));
    const newItems = Object.fromEntries(after.map((item) => [item.uuid, item]));
    return [
      ...changes(
        before.map((item) => item.uuid),
        after.map((item) => item.uuid),
        `${path}/$order`
      ),
      ...changes(oldItems, newItems, path),
    ];
  }
  if (
    before &&
    after &&
    !Array.isArray(before) &&
    !Array.isArray(after) &&
    typeof before === 'object' &&
    typeof after === 'object'
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .sort()
      .flatMap((key) =>
        changes(before[key], after[key], `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`)
      );
  }
  return [
    {
      path: path || '/',
      kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    },
  ];
}

const body = {
  ...module,
  definitionPath: `/AUTOSAR/EcucDefs/${module.shortName}`,
  ...(module.description ? { description: trim(module.description) } : {}),
  containers: module.containers.map((c) => compact(c, '/AUTOSAR/EcucDefs/' + module.shortName)),
};
const contentSha256 = hash(body);

const payload = {
  $source: {
    file: source.split(/[\\/]/).pop(),
    bytes: statSync(source).size,
    sha256: createHash('sha256').update(raw).digest('hex'),
    generator: 'scripts/gen-bswmd-from-arxml.mjs',
    contentSha256,
    descriptionLimit: DESC_LIMIT,
  },
  ...body,
};

const previous = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : undefined;
const previousBody = previous ? content(previous) : undefined;
const changelogPath = resolve(dirname(output), 'changelog.json');
const changelog = existsSync(changelogPath)
  ? JSON.parse(readFileSync(changelogPath, 'utf8'))
  : { format: 'bswmd-changelog/1', modules: {} };
const delta = changes(previousBody, body);
if (delta.length || !changelog.modules[moduleName]) {
  changelog.modules[moduleName] = {
    fromContentSha256: previousBody ? hash(previousBody) : null,
    toContentSha256: contentSha256,
    changes: delta,
  };
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, json(payload), 'utf8');
// Unchanged runs retain the last actual change record, making both artifacts reproducible.
writeFileSync(changelogPath, json(changelog), 'utf8');

const count = (list) => list.reduce((n, c) => n + 1 + count(c.subContainers), 0);
const params = (list) =>
  list.reduce((n, c) => n + c.parameters.length + params(c.subContainers), 0);
const refs = (list) => list.reduce((n, c) => n + c.references.length + refs(c.subContainers), 0);

console.log(
  `[gen] ${moduleName} → ${output}\n` +
    `      容器 ${count(module.containers)} | 参数 ${params(module.containers)} | 引用 ${refs(module.containers)} | ` +
    `体积 ${(statSync(output).size / 1024).toFixed(0)} KB`
);
