/**
 * 官方 Dem 定义的元素定位工具。
 *
 * 背景：bswmd/dem_bswmd.json 已由官方 ECUC ARXML 生成（scripts/gen-bswmd-from-arxml.mjs），
 * 元素 uuid 从手写语义 id（ecuc-dem-dtc-value）变为官方 ECUC:guid。
 * 仅按真实 shortName / 相对路径定位。旧 legacy-map 含非等价映射，禁止用于测试适配。
 * 通用行为用 tests/fixtures/synthetic-dem.json；本索引只用于官方集成测试。
 */
import raw from '../../bswmd/dem_bswmd.json';

type Node = {
  uuid: string;
  shortName: string;
  containers?: Node[];
  parameters?: Node[];
  references?: Node[];
  subContainers?: Node[];
};

const byPathIndex = new Map<string, string>();
const byShortIndex = new Map<string, string[]>();

const walk = (list: Node[], parent: string): void => {
  for (const c of list) {
    const path = parent ? `${parent}/${c.shortName}` : c.shortName;
    byPathIndex.set(path, c.uuid);
    (byShortIndex.get(c.shortName) ?? byShortIndex.set(c.shortName, []).get(c.shortName))!.push(
      c.uuid
    );
    for (const p of c.parameters ?? []) {
      byPathIndex.set(`${path}/${p.shortName}`, p.uuid);
      (byShortIndex.get(p.shortName) ?? byShortIndex.set(p.shortName, []).get(p.shortName))!.push(
        p.uuid
      );
    }
    for (const r of c.references ?? []) {
      byPathIndex.set(`${path}/${r.shortName}`, r.uuid);
      (byShortIndex.get(r.shortName) ?? byShortIndex.set(r.shortName, []).get(r.shortName))!.push(
        r.uuid
      );
    }
    walk(c.subContainers ?? [], path);
  }
};
walk((raw as unknown as Node).containers ?? [], '');

/** 按相对路径（如 DemConfigSet/DemDTC/DemDtcValue）取 uuid。 */
export function byPath(path: string): string {
  const uuid = byPathIndex.get(path);
  if (!uuid) throw new Error(`definitionPath 未命中：${path}`);
  return uuid;
}

/** 按 shortName 取 uuid；重名抛错并提示用 byPath。 */
export function byShort(shortName: string): string {
  const hits = byShortIndex.get(shortName) ?? [];
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`shortName 未命中：${shortName}`);
  throw new Error(`shortName 重名（${hits.length} 处）：${shortName}；请改用 byPath`);
}
