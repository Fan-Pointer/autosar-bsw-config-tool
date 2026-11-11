import type { BswmdModule, BswmdReference } from '../bswmd/BswmdTypes';
import type { ConfigInstance } from './ConfigTypes';
import { collectContainers } from './ConfigTraversal';

/**
 * 工程作用域内的一个容器实例（跨模块引用的候选目标）。
 * `path`/`ecucPath` 的取值规则与 `Arxml.ts` 的工程级导出完全一致——
 * 两处必须产出同一套路径，否则「校验通过」的引用在导出时仍会找不到目标。
 */
export interface ProjectContainerRef {
  /** 容器实例 UUID，即 `ConfigReferenceValue.targetUuid/targetUuids` 里保存的值。 */
  uuid: string;
  /** 目标所属模块 shortName。 */
  moduleShortName: string;
  /** 目标所属模块配置的 AUTOSAR 版本。 */
  moduleVersion: string;
  /** 目标容器定义的绝对定义路径（`BswmdContainer.definitionPath`），用于类型匹配。 */
  definitionPath?: string;
  /** 目标在其所属模块内的实例路径，例如 `DemConfigSet/DemDTC`。 */
  path: string;
  /** 下拉框展示标签：`Dem › DemConfigSet/DemDTC`，可区分不同模块的同名容器。 */
  label: string;
  /** 工程 ARXML 绝对路径：`/Config/<模块>/<路径>`。 */
  ecucPath: string;
}

/** 工程作用域只读索引：容器表 + 按定义路径反查表 + 标签表 + ARXML 路径表。 */
export interface ProjectReferenceScope {
  /** 容器实例 UUID → 目标详情。 */
  containers: ReadonlyMap<string, ProjectContainerRef>;
  /** 容器定义的绝对路径 → 该路径下的全部实例（跨模块候选的主索引）。 */
  byDefinitionPath: ReadonlyMap<string, ProjectContainerRef[]>;
  /** 容器实例 UUID → 展示标签。 */
  labels: ReadonlyMap<string, string>;
  /** 容器实例 UUID → 工程 ARXML 绝对路径（供 `renderArxml` 解析跨模块 VALUE-REF）。 */
  paths: ReadonlyMap<string, string>;
}

/** 作用域输入：工程内的一份模块配置及其定义（与 `exportProjectArxml` 的 entries 同形状）。 */
export interface ProjectScopeInput {
  config: ConfigInstance;
  module: BswmdModule;
}

/**
 * 建立工程引用作用域。
 *
 * 边界完全由调用方决定：只传「当前工程 `setUuids` 命中的模块配置」，本函数不做任何
 * 「取全部配置集」的兜底，因此无工程上下文时调用方应直接传 `undefined` 而不是传全库。
 *
 * uuid 重复时保留首个而不抛错：历史库里出现过重复记录，抛错会让整个工程无法导出。
 * 定义未加载（`collectContainers` 无法解析 definitionRef）的配置整体跳过，同一原因。
 *
 * @param entries 工程内的模块配置与定义。
 * @returns 四张只读表；空输入得到空作用域。
 */
export function buildProjectReferenceScope(
  entries: readonly ProjectScopeInput[]
): ProjectReferenceScope {
  const containers = new Map<string, ProjectContainerRef>();
  const byDefinitionPath = new Map<string, ProjectContainerRef[]>();
  for (const { config, module } of entries) {
    let collected: ReturnType<typeof collectContainers>;
    try {
      collected = collectContainers(config, module);
    } catch {
      // 半成品记录（定义缺失）不阻断索引：跨模块引用解析不应因一条坏记录整体失效。
      continue;
    }
    for (const entry of collected) {
      if (containers.has(entry.container.uuid)) continue;
      const target: ProjectContainerRef = {
        uuid: entry.container.uuid,
        moduleShortName: module.shortName,
        moduleVersion: config.version,
        ...(entry.definition.definitionPath
          ? { definitionPath: entry.definition.definitionPath }
          : {}),
        path: entry.path,
        label: `${module.shortName} › ${entry.path}`,
        // 必须与 Arxml.ts 工程级导出的 sharedPaths 完全一致。
        ecucPath: `/Config/${module.shortName}/${entry.path}`,
      };
      containers.set(target.uuid, target);
      if (target.definitionPath) {
        const bucket = byDefinitionPath.get(target.definitionPath) ?? [];
        bucket.push(target);
        byDefinitionPath.set(target.definitionPath, bucket);
      }
    }
  }
  return {
    containers,
    byDefinitionPath,
    labels: new Map([...containers].map(([uuid, target]) => [uuid, target.label])),
    paths: new Map([...containers].map(([uuid, target]) => [uuid, target.ecucPath])),
  };
}

/**
 * 读取某个容器实例的展示标签。
 * @param scope 工程作用域；无工程上下文时为 undefined。
 * @param uuid 容器实例 UUID。
 * @returns 标签；作用域外或标签索引缺失时返回 undefined，由调用方决定回退文案。
 */
export function labelOf(
  scope: ProjectReferenceScope | undefined,
  uuid: string
): string | undefined {
  return scope?.labels.get(uuid);
}

/**
 * 解析一条跨模块（外部）引用在当前工程内的候选目标。
 *
 * 只按定义路径精确匹配：`destinationRefs` 优先，其次 `destinationRef`。
 * 两者皆空（FOREIGN / INSTANCE 等无静态目标的引用）返回空数组——不臆造候选。
 * 不排除引用所在模块：CHOICE 引用可能混合本地与外部候选，由调用方按需过滤。
 *
 * @param reference 引用定义。
 * @param scope 工程作用域；undefined（工程已关闭）时恒返回空数组。
 * @returns 匹配的容器实例，保持工程遍历顺序。
 */
export function resolveExternalReferenceCandidates(
  reference: BswmdReference,
  scope: ProjectReferenceScope | undefined
): ProjectContainerRef[] {
  if (!scope) return [];
  const paths = reference.destinationRefs?.length
    ? reference.destinationRefs
    : reference.destinationRef
      ? [reference.destinationRef]
      : [];
  if (!paths.length) return [];
  return paths.flatMap((path) => scope.byDefinitionPath.get(path) ?? []);
}
