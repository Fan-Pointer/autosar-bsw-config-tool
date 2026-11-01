/**
 * 生成旧语义 id → 新官方 uuid 的映射表。
 * 用法：npx vite-node scripts/map-legacy-dem-ids.mjs
 * 输出：tests/helpers/legacy-map.json + 未匹配清单（stdout）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacyRaw = JSON.parse(
  readFileSync(resolve(ROOT, '.temp/dem_bswmd.legacy.json'), 'utf8')
);
const fresh = JSON.parse(readFileSync(resolve(ROOT, 'bswmd/dem_bswmd.json'), 'utf8'));
const PREFIX = '/AUTOSAR/EcucDefs/Dem/';

// 旧 JSON：语义 id → 相对路径（DemConfigSet/DemDTC/…）
const legacyEntries = new Map(); // semanticId -> { path, shortName, kind }
const walkLegacy = (containers, parent) => {
  for (const c of containers) {
    const path = parent ? `${parent}/${c.shortName}` : c.shortName;
    legacyEntries.set(c.uuid, { path, shortName: c.shortName, kind: 'container' });
    for (const p of c.parameters ?? [])
      legacyEntries.set(p.uuid, { path: `${path}/${p.shortName}`, shortName: p.shortName, kind: 'parameter' });
    for (const r of c.references ?? [])
      legacyEntries.set(r.uuid, { path: `${path}/${r.shortName}`, shortName: r.shortName, kind: 'reference' });
    walkLegacy(c.subContainers ?? [], path);
  }
};
walkLegacy(legacyRaw.containers, '');

// 新 JSON：相对路径 → uuid
const freshByPath = new Map();
const freshShort = new Map(); // shortName -> uuid[]（重名检测）
const walkFresh = (containers, parent) => {
  for (const c of containers) {
    const path = parent ? `${parent}/${c.shortName}` : c.shortName;
    freshByPath.set(path, c.uuid);
    (freshShort.get(c.shortName) ?? freshShort.set(c.shortName, []).get(c.shortName)).push(c.uuid);
    for (const p of c.parameters ?? []) {
      freshByPath.set(`${path}/${p.shortName}`, p.uuid);
      (freshShort.get(p.shortName) ?? freshShort.set(p.shortName, []).get(p.shortName)).push(p.uuid);
    }
    for (const r of c.references ?? []) {
      freshByPath.set(`${path}/${r.shortName}`, r.uuid);
      (freshShort.get(r.shortName) ?? freshShort.set(r.shortName, []).get(r.shortName)).push(r.uuid);
    }
    walkFresh(c.subContainers ?? [], path);
  }
};
walkFresh(fresh.containers, '');

const map = {};
const unmatched = [];
const ambiguous = [];

/**
 * 人工裁定映射（旧手写版结构错误 / 官方重构后的去向），路径为相对 Dem 根：
 * - 旧版把若干全局参数错放进 DemConfigSet，官方在 DemGeneral/DemEventMemorySet 下；
 * - 旧版拼写 DemDebounceTimeBasedClass，官方为 DemDebounceTimeBaseClass；
 * - J1939NodeRef 官方已无（J1939 节点引用被重构），STRING 语义由 ENUM 字符串值承载
 *   （readValue 对 ENUM 不做值域校验，转义/往返行为一致）；
 * - ImmediateNvStorage 官方已无，BOOLEAN 开关由 DemAgingAllowed（必填）承载。
 */
const OVERRIDES = {
  'ecuc-dem-general-occurrence-counter-support':
    'DemGeneral/DemEventMemorySet/DemPrimaryMemory/DemOccurrenceCounterProcessing',
  'ecuc-dem-debounce-time-behavior': 'DemConfigSet/DemDebounceTimeBaseClass/DemDebounceBehavior',
  'ecuc-dem-general-max-number-event': 'DemGeneral/DemMaxNumberEventEntryEventBuffer',
  'ecuc-dem-dtc-j1939-node-ref': 'DemConfigSet/DemDTC/DemDTCSeverity',
  'ecuc-dem-attr-immediate-nv': 'DemConfigSet/DemDTCAttributes/DemAgingAllowed',
  'ecuc-dem-event-failure-cycle-threshold':
    'DemConfigSet/DemEventParameter/DemEventFailureCycleCounterThresholdAdaptable',
  'ecuc-dem-event-debounce-time-ref':
    'DemConfigSet/DemEventParameter/DemDebounceAlgorithmClass/DemDebounceTimeBase/DemDebounceTimeBaseRef',
  'ecuc-dem-debounce-time-def': 'DemConfigSet/DemDebounceTimeBaseClass',
  'ecuc-dem-opcycle-type': 'DemGeneral/DemOperationCycle/DemOperationCycleId',
};

for (const [id, { path, shortName }] of legacyEntries) {
  const overridePath = OVERRIDES[id];
  if (overridePath) {
    const uuid = freshByPath.get(overridePath);
    if (!uuid) {
      unmatched.push({ id, shortName, path: overridePath, note: 'override 路径未命中' });
      continue;
    }
    map[id] = { uuid, via: 'override', shortName, path: overridePath };
    continue;
  }
  const uuid = freshByPath.get(path);
  if (uuid) {
    map[id] = { uuid, via: 'path', shortName, path };
  } else if ((freshShort.get(shortName) ?? []).length === 1) {
    map[id] = { uuid: freshShort.get(shortName)[0], via: 'shortName', shortName, path };
  } else if ((freshShort.get(shortName) ?? []).length > 1) {
    ambiguous.push({ id, shortName, path, candidates: freshShort.get(shortName) });
  } else {
    unmatched.push({ id, shortName, path });
  }
}

writeFileSync(
  resolve(ROOT, 'tests/helpers/legacy-map.json'),
  JSON.stringify(
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.uuid])),
    null,
    2
  ) + '\n',
  'utf8'
);

console.log(`[map] 旧条目 ${legacyEntries.size} | 匹配 ${Object.keys(map).length}（path ${Object.values(map).filter(v=>v.via==='path').length} / shortName ${Object.values(map).filter(v=>v.via==='shortName').length}）`);
if (ambiguous.length) {
  console.log(`[ambiguous] ${ambiguous.length}:`);
  for (const a of ambiguous) console.log('  ', a.id, '->', a.shortName, a.path);
}
if (unmatched.length) {
  console.log(`[unmatched] ${unmatched.length}:`);
  for (const u of unmatched) console.log('  ', u.id, '->', u.shortName, u.path);
}
