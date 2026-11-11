/** Engineering metadata is stored separately; configuration records keep their existing schema. */
export interface ProjectMetadata {
  projectUuid: string;
  name: string;
  /** Optional project description (0-100 chars, G40). */
  description?: string;
  autosarVersion: string;
  chip: { family: string; note?: string };
  moduleShortNames: string[];
  setUuids: string[];
  /** Detached records remain in the library; re-adding may recover these unassigned records. */
  detachedSetUuids?: string[];
  createdAt: string;
  /** Last metadata/config change timestamp (G40); absent on legacy records. */
  updatedAt?: string;
}
export interface ProjectInput {
  name: string;
  description?: string;
  autosarVersion: string;
  chip: { family: string; note?: string };
  moduleShortNames: string[];
}

/** Validate the sidecar without normalizing or rewriting the saved value.
 * @param raw Untrusted saved metadata. @returns Valid project records; throws on malformed metadata.
 */
export function parseProjects(raw: unknown): ProjectMetadata[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw !== 'object') throw new Error('工程索引格式无法识别，原数据已保留');
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.projects))
    throw new Error('工程索引版本或列表无效，原数据已保留');
  const ids = new Set<string>();
  const setIds = new Set<string>();
  for (const item of value.projects) {
    if (!item || typeof item !== 'object') throw new Error('工程条目无效');
    const p = item as Record<string, unknown>;
    if (
      !['projectUuid', 'name', 'autosarVersion', 'createdAt'].every(
        (key) => typeof p[key] === 'string' && p[key]
      )
    )
      throw new Error('工程属性缺失');
    if (
      !p.chip ||
      typeof p.chip !== 'object' ||
      typeof (p.chip as Record<string, unknown>).family !== 'string'
    )
      throw new Error('工程芯片属性无效');
    for (const key of ['moduleShortNames', 'setUuids']) {
      if (!Array.isArray(p[key]) || !(p[key] as unknown[]).every((id) => typeof id === 'string'))
        throw new Error('工程模块或模块配置关联无效');
    }
    if (
      p.detachedSetUuids !== undefined &&
      (!Array.isArray(p.detachedSetUuids) ||
        !p.detachedSetUuids.every((id) => typeof id === 'string'))
    )
      throw new Error('工程已移除模块关联无效');
    if (p.description !== undefined && typeof p.description !== 'string')
      throw new Error('工程描述格式无效');
    if (p.updatedAt !== undefined && typeof p.updatedAt !== 'string')
      throw new Error('工程更新时间格式无效');
    if (ids.has(p.projectUuid as string)) throw new Error('工程 UUID 重复');
    ids.add(p.projectUuid as string);
    for (const id of p.setUuids as string[]) {
      if (setIds.has(id)) throw new Error('模块配置被重复关联至工程');
      setIds.add(id);
    }
  }
  return value.projects as ProjectMetadata[];
}
