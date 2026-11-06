/**
 * 从 AUTOSAR 官方 ECUC 参数定义 ARXML 生成内部 BSWMD JSON。
 *
 * 用法：node scripts/gen-bswmd-from-arxml.mjs <模块名> [来源.arxml] [输出.json]
 * 也支持 <模块名> <输出.json>，来源省略时使用仓库父目录的官方 4.4.0 文件。
 *
 * 生成物携带溯源元数据，便于日后核对来源与版本。
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { writeModuleArtifact } from './lib/bswmd-artifacts.mjs';
import { generateCatalog } from './lib/bswmd-catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_SOURCE = resolve(ROOT, '..', 'AUTOSAR_MOD_ECUConfigurationParameters_4.4.4.arxml');

if (process.argv[2] === '--all') {
  if (!process.argv[3] || !process.argv[4])
    throw new Error('--all requires a source ARXML and output directory');
  await generateCatalog(resolve(process.argv[3]), resolve(process.argv[4]));
  process.exit(0);
}
const moduleName = process.argv[2] ?? 'Dem';
const outputOnly = process.argv[3]?.endsWith('.json');
const source = resolve(outputOnly || !process.argv[3] ? DEFAULT_SOURCE : process.argv[3]);
const output = resolve(
  (outputOnly ? process.argv[3] : process.argv[4]) ??
    resolve(ROOT, 'bswmd', `${moduleName.toLowerCase()}_bswmd.json`)
);
if (!output.endsWith('.json') || source === output) throw new Error('输出须为独立 JSON 文件');

// Existing Vite resolves the core's TypeScript imports and @ alias on supported Node versions.
// Middleware mode with HMR/watch disabled creates no listening browser/server service.
const raw = readFileSync(source);
const loader = await createServer({
  root: ROOT,
  cacheDir: `.temp/vite-extract-${process.pid}`,
  optimizeDeps: { noDiscovery: true, include: [] },
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
if (!['4.4.0', '4.2.2'].includes(module.version))
  throw new Error(`抽取仅支持 CP 4.2.2 / 4.4.0，输入模块版本为 ${module.version}`);

writeModuleArtifact(module, source, output);
const countContainers = (list) =>
  list.reduce((n, c) => n + 1 + countContainers(c.subContainers), 0);
const countParameters = (list) =>
  list.reduce((n, c) => n + c.parameters.length + countParameters(c.subContainers), 0);
const countReferences = (list) =>
  list.reduce((n, c) => n + c.references.length + countReferences(c.subContainers), 0);
console.log(
  `[gen] ${moduleName} → ${output}\n` +
    `      容器 ${countContainers(module.containers)} | 参数 ${countParameters(module.containers)} | 引用 ${countReferences(module.containers)} | ` +
    `体积 ${(statSync(output).size / 1024).toFixed(0)} KB`
);
