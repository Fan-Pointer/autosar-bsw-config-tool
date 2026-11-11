import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decodeXmlText, stripDoctype, withoutXmlComments } from './XmlSafety';
import type { BswmdContainer, BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance, ConfigReferenceValue } from '../config/ConfigTypes';
import { referenceTargets } from '../config/ConfigTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { referenceDefinitionDest } from '../config/ReferenceCandidates';
import {
  buildProjectReferenceScope,
  type ProjectReferenceScope,
} from '../config/ProjectReferenceScope';
import { createParameterValue } from '../config/ConfigValues';
import {
  assertOutputReady,
  evaluateOutputReadiness,
  type OutputCheckResult,
} from '../output/OutputGate';
import { generateUUID } from '@/utils/uuid';
import { checkImportSize, hydrateConfig, record, serializeConfig, string } from './ConfigJson';
import type { SerializedContainer } from './IoTypes';

// AUTOSAR CP 4.4.0, TPS_ASR_00011/00017: the namespace is shared across compatible releases.
export const AUTOSAR_NAMESPACE = 'http://autosar.org/schema/r4.0';
const LEGACY_NAMESPACE = 'http://autosar.org/schema/r4.2.2';
type XmlNode = Record<string, unknown>;
const EDITOR_DATA_GID = 'AUTOSAR-BSW-CONFIG-TOOL-V1';

function escapeXml(value: string): string {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
    throw new Error('文本包含 XML 不允许的控制字符');
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!
  );
}
function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}
function adminData(fields: Record<string, string | undefined>): string {
  const values = Object.entries(fields).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  );
  if (!values.length) return '';
  return `<ADMIN-DATA><SDGS><SDG GID="${EDITOR_DATA_GID}">${values
    .map(([key, value]) => `<SD GID="${escapeXml(key)}">${escapeXml(value)}</SD>`)
    .join('')}</SDG></SDGS></ADMIN-DATA>`;
}
function descriptionTag(value: string | undefined): string {
  return value === undefined ? '' : `<DESC><L-2 L="FOR-ALL">${escapeXml(value)}</L-2></DESC>`;
}
function emptyStates(
  fields: { definitionRef: string; isConfigured: boolean }[]
): string | undefined {
  return fields.length
    ? JSON.stringify(
        fields.map(({ definitionRef, isConfigured }) => ({ definitionRef, isConfigured }))
      )
    : undefined;
}
function definitionPaths(module: BswmdModule): Map<string, string> {
  const paths = new Map<string, string>();
  const visit = (definitions: BswmdContainer[], parent: string): void => {
    for (const definition of definitions) {
      const path = definition.definitionPath ?? `${parent}/${definition.shortName}`;
      paths.set(definition.uuid, path);
      for (const field of [...definition.parameters, ...definition.references])
        paths.set(field.uuid, field.definitionPath ?? `${path}/${field.shortName}`);
      visit(definition.subContainers, path);
    }
  };
  visit(module.containers, module.definitionPath ?? `/AUTOSAR/EcucDefs/${module.shortName}`);
  return paths;
}
function parameterDest(type: BswmdParameter['type']): string {
  if (type === 'FUNCTION') return 'ECUC-FUNCTION-NAME-DEF';
  return `ECUC-${{ INTEGER: 'INTEGER', FLOAT: 'FLOAT', BOOLEAN: 'BOOLEAN', ENUM: 'ENUMERATION', STRING: 'STRING', FUNCTION: 'FUNCTION-NAME', REFERENCE: 'STRING' }[type]}-PARAM-DEF`;
}

/** Export the loaded ECUC value tree with definition paths and instance references.
 * @param config Configuration to export.
 * @param module Matching BSWMD module.
 * @param outputCheck Optional result evaluated in this same action (never cached across edits).
 * @returns Escaped AUTOSAR r4.0 XML using the loaded release's definitions.
 */
export function exportArxml(
  config: ConfigInstance,
  module: BswmdModule,
  outputCheck?: OutputCheckResult,
  /** 工程引用作用域（G47）：跨模块引用目标的解析与输出校验都依赖它。 */
  scope?: ProjectReferenceScope
): string {
  assertOutputReady(outputCheck ?? evaluateOutputReadiness(config, module, [], scope));
  return renderArxml(config, module, scope ? new Map(scope.paths) : undefined);
}

/**
 * 渲染单模块 ARXML（不做输出闸门校验）。工程级导出用它在 force 模式下仍产出完整内容，
 * 并可通过 sharedPaths 把跨模块引用写成 `/Config/<其它模块>/...`。
 * @param config 配置集。
 * @param module 模块定义。
 * @param sharedPaths 全工程容器路径索引（可选）。
 * @returns 单模块 AUTOSAR 文档。
 */
export function renderArxml(
  config: ConfigInstance,
  module: BswmdModule,
  sharedPaths?: Map<string, string>
): string {
  const checked = hydrateConfig(serializeConfig(config), [module]);
  const definitions = definitionPaths(module);
  const entries = collectContainers(checked, module);
  const instancePaths = new Map(sharedPaths ?? []);
  for (const entry of entries)
    instancePaths.set(entry.container.uuid, `/Config/${module.shortName}/${entry.path}`);
  const defRef = (id: string, dest: string): string =>
    `<DEFINITION-REF DEST="${dest}">${escapeXml(definitions.get(id)!)}</DEFINITION-REF>`;
  const containers = (items: ConfigContainer[], defs: BswmdContainer[]): string =>
    items
      .map((container) => {
        const definition = defs.find((item) => item.uuid === container.definitionRef)!;
        const parameters = definition.parameters
          .flatMap((def) => {
            const entry = container.parameters.get(def.uuid);
            if (!entry) return [];
            // G32: a multi-value parameter stores rows as the value array; expand one element per row.
            // 用户裁定（2026-11-09）默认值即配置：ARXML 只写显式确认值（ECUC 惯例，
            // 未写条目在导入时按定义默认值语义回退）；C 代码侧由 CGenerator 输出必填默认值。
            const rows = Array.isArray(entry.value) && entry.value.length
              ? entry.value.map((row) => ({ value: row, isConfigured: true }))
              : [entry];
            return rows.map((row) => ({ ...row, definitionRef: def.uuid }));
          })
          .filter((p) => p.isConfigured === true && p.value !== undefined)
          .map((parameter) => {
            const def = definition.parameters.find(
              (item) => item.uuid === parameter.definitionRef
            )!;
            const kind = ['INTEGER', 'FLOAT', 'BOOLEAN'].includes(def.type)
              ? 'ECUC-NUMERICAL-PARAM-VALUE'
              : 'ECUC-TEXTUAL-PARAM-VALUE';
            return `<${kind} UUID="${generateUUID()}">${defRef(def.uuid, parameterDest(def.type))}${tag('VALUE', String(parameter.value))}</${kind}>`;
          })
          .join('');
        const references = definition.references
          .flatMap((def) => {
            const value = container.references.get(def.uuid);
            if (!value || value.isConfigured !== true) return [];
            // G42：多值引用逐目标展开为独立元素（ARXML 语义：每个 VALUE-REF 一条）。
            return referenceTargets(value).map((targetUuid) => ({
              definitionRef: def.uuid,
              targetUuid,
              isConfigured: true,
            }));
          })
          .filter((ref) => ref.targetUuid)
          .map((ref) => {
            const target = instancePaths.get(ref.targetUuid);
            if (!target) throw new Error(`${container.shortName}：引用目标不存在，无法导出 ARXML`);
            const refDefinition = definition.references.find(
              (item) => item.uuid === ref.definitionRef
            )!;
            return `<ECUC-REFERENCE-VALUE UUID="${generateUUID()}">${defRef(ref.definitionRef, referenceDefinitionDest(refDefinition))}<VALUE-REF DEST="ECUC-CONTAINER-VALUE">${escapeXml(target)}</VALUE-REF></ECUC-REFERENCE-VALUE>`;
          })
          .join('');
        // ECUC absence cannot distinguish untouched suggestions from a deliberate disable.
        // Preserve only that editor state in SDG, never as a parameter/reference value.
        const editor = adminData({
          ...Object.fromEntries(
            [...container.parameters.values()]
              .filter(
                (p) =>
                  p.description !== undefined &&
                  p.description !==
                    definition.parameters.find((def) => def.uuid === p.definitionRef)?.description
              )
              .map((p) => [`parameterDescription:${p.definitionRef}`, p.description])
          ),
          disabledParameters: emptyStates(
            [...container.parameters.values()].filter((p) => p.value === undefined)
          ),
          emptyReferences: emptyStates(
            [...container.references.values()].filter((r) => !r.targetUuid && r.isConfigured)
          ),
        });
        return `<ECUC-CONTAINER-VALUE UUID="${escapeXml(container.uuid)}">${tag('SHORT-NAME', container.shortName)}${descriptionTag(container.description)}${editor}${defRef(definition.uuid, definition.choice ? 'ECUC-CHOICE-CONTAINER-DEF' : 'ECUC-PARAM-CONF-CONTAINER-DEF')}<PARAMETER-VALUES>${parameters}</PARAMETER-VALUES><REFERENCE-VALUES>${references}</REFERENCE-VALUES><SUB-CONTAINERS>${containers(container.subContainers, definition.subContainers)}</SUB-CONTAINERS></ECUC-CONTAINER-VALUE>`;
      })
      .join('');
  const metadata = adminData({
    release: checked.version,
    createdAt: String(checked.createdAt),
    lastModified: String(checked.lastModified),
    name: checked.name,
  });
  return arxmlDocument([moduleValuesXml(checked, module, metadata, containers)]);
}

/** 单个模块的 ECUC-MODULE-CONFIGURATION-VALUES 段（G44 工程 ARXML 复用）。 */
function moduleValuesXml(
  checked: ConfigInstance,
  module: BswmdModule,
  metadata: string,
  containersXml: (list: ConfigContainer[], definitions: BswmdContainer[]) => string
): string {
  return `<ECUC-MODULE-CONFIGURATION-VALUES UUID="${escapeXml(checked.uuid)}">${tag('SHORT-NAME', module.shortName)}${metadata}<DEFINITION-REF DEST="ECUC-MODULE-DEF">${escapeXml(module.definitionPath ?? `/AUTOSAR/EcucDefs/${module.shortName}`)}</DEFINITION-REF><IMPLEMENTATION-CONFIG-VARIANT>VARIANT-PRE-COMPILE</IMPLEMENTATION-CONFIG-VARIANT><CONTAINERS>${containersXml(checked.containers, module.containers)}</CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES>`;
}

/** 把若干模块段组装为一个 AUTOSAR 文档（单模块与工程级共用同一外壳）。 */
/**
 * 把单行 XML 展开为可读的多行结构（只调整空白，不改内容）。
 * 文本节点中的 < > 已转义，因此按「><」断行是安全的。
 * @param xml 压缩后的 XML。
 * @returns 带缩进的多行 XML。
 */
export function prettyXml(xml: string): string {
  const lines = xml.replace(/></g, '>\n<').split('\n');
  const output: string[] = [];
  let depth = 0;
  for (const line of lines) {
    if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
    output.push('  '.repeat(depth) + line);
    const inline = /^<[^>]+>[^<]*<\/[^>]+>$/.test(line);
    if (/^<[^/!?]/.test(line) && !/\/>$/.test(line) && !inline) depth += 1;
  }
  // 把被拆开的空元素再合回去（如 <PARAMETER-VALUES>\n</PARAMETER-VALUES>）：
  // 只调整空白不改内容，空段落必须保持 <X></X> 形态。
  return output.join('\n').replace(/(<([\w:-]+)(?:\s[^<>]*)?>)\n[ \t]*(<\/\2>)/g, '$1$3');
}

function arxmlDocument(modules: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AUTOSAR xmlns="${AUTOSAR_NAMESPACE}"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Config</SHORT-NAME><ELEMENTS>${modules.join('')}</ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
}

/**
 * 工程级 ARXML：把该工程的多个模块配置合入同一文档（G44 / FR-28）。
 * 每个模块先过自己的输出闸门；任一模块未就绪则整体拒绝，并指明模块名。
 * @param entries 工程的配置集与对应定义。
 * @returns 单文档多模块 ARXML；失败时抛出列出模块与原因的聚合错误。
 */
export function exportProjectArxml(
  entries: { config: ConfigInstance; module: BswmdModule }[],
  /** true = 校验未通过也产出（用户 2026-11-11 裁定：导出不应被校验阻塞）。 */
  force = false
): string {
  if (!entries.length) throw new Error('工程内没有可导出的模块配置');
  // 先建立全工程引用作用域：跨模块引用的目标才能解析，并写成 `/Config/<其它模块>/...`。
  const scope = buildProjectReferenceScope(entries);
  const failures: string[] = [];
  const modules: string[] = [];
  for (const { config, module } of entries) {
    try {
      // 非 force 仍先过闸门；force 时跳过校验直接渲染，保证内容完整（不再只剩注释）。
      if (!force) assertOutputReady(evaluateOutputReadiness(config, module, [], scope));
      const single = renderArxml(config, module, new Map(scope.paths));
      const start = single.indexOf('<ECUC-MODULE-CONFIGURATION-VALUES');
      const end = single.lastIndexOf('</ECUC-MODULE-CONFIGURATION-VALUES>');
      if (start < 0 || end < 0) throw new Error('模块配置段缺失');
      modules.push(single.slice(start, end + '</ECUC-MODULE-CONFIGURATION-VALUES>'.length));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const firstLine = message.split('\n').filter(Boolean).slice(0, 2).join('；');
      failures.push(`${module.shortName}（${firstLine}）`);
    }
  }
  if (failures.length && !force)
    throw new Error(`以下模块未通过输出校验，未生成工程 ARXML：\n${failures.join('\n')}`);
  // force 下真正渲染失败的模块才以注释标注；校验类问题已不影响产出。
  if (failures.length && force)
    modules.push(`<!-- 渲染失败、未导出：${failures.join('；')} -->`);
  // 工程级导出对使用者可读性要求更高（此前整篇一行，被误认为「只有两行」）。
  return prettyXml(arxmlDocument(modules));
}

function nodes(parent: XmlNode, key: string): XmlNode[] {
  const value = parent[key];
  if (value === undefined || value === '') return [];
  // 空白文本等价于「空段落」：美化后的 <X>\n</X> 在 trimValues:false 下会解析成空白字符串，
  // 第三方文件也可能直接写成空元素。两种都必须按「没有子节点」处理，而不是判成坏类型。
  if (typeof value === 'string' && value.trim() === '') return [];
  return (Array.isArray(value) ? value : [value]).map((item) => record(item, key));
}
function single(parent: XmlNode, key: string): XmlNode {
  const values = nodes(parent, key);
  if (values.length > 1) throw new Error(`${key}：不允许重复`);
  return values[0] ?? {};
}
function text(parent: XmlNode, key: string): string {
  const value = parent[key];
  if (typeof value === 'string') return value;
  if (value === undefined) throw new Error(`XML 缺少 ${key}`);
  return string(record(value, key)['#text'], key, true);
}
function editorData(parent: XmlNode): Map<string, string> {
  const groups = nodes(single(single(parent, 'ADMIN-DATA'), 'SDGS'), 'SDG').filter(
    (group) => group['@_GID'] === EDITOR_DATA_GID
  );
  if (groups.length > 1) throw new Error('编辑器 ADMIN-DATA 重复');
  const fields = new Map<string, string>();
  for (const field of nodes(groups[0] ?? {}, 'SD')) {
    const key = string(field['@_GID'], 'SD.GID');
    if (fields.has(key)) throw new Error(`编辑器 ADMIN-DATA 字段重复：${key}`);
    fields.set(key, field['#text'] === undefined ? '' : string(field['#text'], key, true));
  }
  return fields;
}
function emptyFieldStates(
  value: string | undefined,
  allowed: { uuid: string }[]
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (value === undefined) return result;
  const states: unknown = JSON.parse(value);
  if (!Array.isArray(states)) throw new Error('编辑器字段状态应为数组');
  for (const item of states) {
    const state = record(item, '编辑器字段状态');
    const id = string(state.definitionRef, '编辑器字段 definitionRef');
    if (
      !allowed.some((def) => def.uuid === id) ||
      result.has(id) ||
      typeof state.isConfigured !== 'boolean'
    )
      throw new Error('编辑器字段状态的定义或 isConfigured 无效');
    result.set(id, state.isConfigured);
  }
  return result;
}
function timestampField(fields: Map<string, string>, key: string, fallback: number): number {
  const value = fields.get(key);
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${key}：时间戳无效`);
  return Number(value);
}
function readDescription(parent: XmlNode, fallback?: string): string | undefined {
  if (parent.DESC === undefined) return fallback;
  const flatten = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(flatten).join(' ');
    return Object.entries(record(value, 'DESC'))
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, child]) => flatten(child))
      .join('');
  };
  return flatten(parent.DESC);
}
function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (typeof node === 'string') return decodeXmlText(node);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key.startsWith('@_xmlns') ? key : key.replace(/^([^:]+):/, ''),
      normalize(value),
    ])
  );
}
function xmlPreflight(source: string): void {
  checkImportSize(new TextEncoder().encode(source).byteLength);
  // Reject declarations before invoking either validator or parser: entities never get an expansion opportunity.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))
    throw new Error('禁止 DTD / DOCTYPE 与外部实体，文件未被解析');
  if (/<(?:[\w.-]+:)?include\b/i.test(source)) throw new Error('禁止 XInclude 外部引用');
  let depth = 0;
  for (const token of source.matchAll(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]*>/g
  )) {
    if (/^<(?:!|\?)/.test(token[0])) continue;
    if (token[0].startsWith('</')) depth--;
    else if (!token[0].endsWith('/>')) depth++;
    if (depth > 300) throw new Error('XML 嵌套过深（上限 300 层）');
  }
}
function readValue(value: string, definition: BswmdParameter): unknown {
  if (definition.type === 'BOOLEAN') {
    if (!['true', 'false', '1', '0'].includes(value.trim()))
      throw new Error(`${definition.shortName}：布尔值无效`);
    return value.trim() === 'true' || value.trim() === '1';
  }
  if (definition.type === 'INTEGER' || definition.type === 'FLOAT') {
    if (!value.trim()) throw new Error(`${definition.shortName}：数值为空`);
    const number = Number(value);
    if (
      !Number.isFinite(number) ||
      (definition.type === 'INTEGER' && !Number.isSafeInteger(number))
    )
      throw new Error(`${definition.shortName}：数值无效`);
    return number;
  }
  return value;
}

/** Parse a single ECUC module, rejecting declarations before XML parsing.
 * @param source ARXML content (no DTD or entity declarations permitted).
 * @param modules Loaded BSWMD definitions.
 * @param onWarning Receives compatibility warnings; the UI displays these before import.
 * @returns Validated standalone configuration with resolved forward references.
 */
/** 工程级 ARXML 中一个模块段的基本信息（G45 导入勾选列表）。 */
export interface ArxmlModuleHeader {
  shortName: string;
  definitionPath: string;
  /** 文件自带的编辑器 release 标记（缺省按 4.4.0）。 */
  release: string;
  uuid: string;
}

/**
 * 轻量扫描 ARXML 中的模块配置段（不解析容器树，供导入弹窗列举）。
 * @param source 原始 ARXML 文本。
 * @returns 按文件顺序的模块头信息；解析失败抛错。
 */
export function scanArxmlModules(source: string): ArxmlModuleHeader[] {
  checkImportSize(new TextEncoder().encode(source).byteLength);
  const clean = withoutXmlComments(stripDoctype(source));
  const headers: ArxmlModuleHeader[] = [];
  const pattern =
    /<ECUC-MODULE-CONFIGURATION-VALUES(?=\s)(?![-\w])[^>]*>([\s\S]*?)<\/ECUC-MODULE-CONFIGURATION-VALUES>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean))) {
    const body = match[1];
    const shortName = /<SHORT-NAME>([^<]+)<\/SHORT-NAME>/.exec(body)?.[1]?.trim();
    const definitionPath = /<DEFINITION-REF[^>]*>([^<]+)<\/DEFINITION-REF>/.exec(body)?.[1]?.trim();
    const release = /<SD\s+GID="release">([^<]+)<\/SD>/.exec(body)?.[1]?.trim() ?? '4.4.0';
    const uuid = /UUID="([^"]+)"/.exec(match[0])?.[1] ?? '';
    if (shortName && definitionPath)
      headers.push({ shortName, definitionPath, release, uuid });
  }
  if (!headers.length) throw new Error('文件里没有可导入的 ECUC 模块配置');
  return headers;
}

/** 解析并校验 ARXML 文档，返回归一化后的 AUTOSAR 根节点与命名空间（导入与工程级扫描共用同一条校验链）。 */
function parseArxmlDocument(source: string): { autosar: XmlNode; namespace: unknown } {
  checkImportSize(new TextEncoder().encode(source).byteLength);
  source = withoutXmlComments(source);
  xmlPreflight(source);
  const safeSource = stripDoctype(source);
  const validation = XMLValidator.validate(safeSource);
  if (validation !== true)
    throw new Error(`XML 格式错误（第 ${validation.err.line} 行）：${validation.err.msg}`);
  // CDATA is literal text; protect its ampersands from our single built-in-entity decode pass.
  const parserSource = safeSource.replace(
    /<!\[CDATA\[([\s\S]*?)\]\]>/g,
    (_match: string, content: string) => `<![CDATA[${content.replace(/&/g, '&amp;')}]]>`
  );
  const parsed: unknown = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: false,
  }).parse(parserSource);
  const raw = record(parsed, 'XML');
  const rootKey = Object.keys(raw).find((key) => key === 'AUTOSAR' || key.endsWith(':AUTOSAR'));
  if (!rootKey) throw new Error('缺少 AUTOSAR 根节点');
  const root = record(raw[rootKey], 'AUTOSAR');
  const prefix = rootKey.includes(':') ? ':' + rootKey.split(':')[0] : '';
  const namespace = root['@_xmlns' + prefix];
  if (namespace !== AUTOSAR_NAMESPACE && namespace !== LEGACY_NAMESPACE)
    throw new Error('ARXML 命名空间须为 AUTOSAR r4.0（兼容旧工具 r4.2.2）');
  return { autosar: record(normalize(root), 'AUTOSAR'), namespace };
}

/** 枚举文档中所有模块配置段及其 AR 包路径。 */
function moduleSegments(autosar: XmlNode): { node: XmlNode; packagePath: string }[] {
  const found: { node: XmlNode; packagePath: string }[] = [];
  const packages = (parent: XmlNode, path: string): void => {
    for (const pkg of nodes(single(parent, 'AR-PACKAGES'), 'AR-PACKAGE')) {
      const packagePath = `${path}/${text(pkg, 'SHORT-NAME')}`;
      found.push(
        ...nodes(single(pkg, 'ELEMENTS'), 'ECUC-MODULE-CONFIGURATION-VALUES').map((node) => ({
          node,
          packagePath,
        }))
      );
      packages(pkg, packagePath);
    }
  };
  packages(autosar, '');
  return found;
}

/**
 * 工程级文档的容器路径索引：`/Config/<模块短名>/<容器路径>` → 容器 uuid。
 *
 * 路径规则与 `renderArxml` 的 sharedPaths **严格一致**，否则工程级导入无法解析跨模块引用。
 * 仅用于解析引用目标：uuid 重复时保留首个（不抛错），缺失 UUID 的容器跳过——
 * 真正的结构校验仍由逐模块的 `importArxml` 负责。
 *
 * @param source ARXML 文本（工程级或单模块均可）。
 * @returns 路径到容器 uuid 的只读索引。
 */
export function collectProjectContainerPaths(source: string): ReadonlyMap<string, string> {
  const paths = new Map<string, string>();
  const walk = (parent: XmlNode, prefixPath: string): void => {
    for (const node of nodes(parent, 'ECUC-CONTAINER-VALUE')) {
      const path = `${prefixPath}/${text(node, 'SHORT-NAME')}`;
      const uuid = node['@_UUID'] === undefined ? '' : string(node['@_UUID'], 'UUID');
      if (uuid && !paths.has(path)) paths.set(path, uuid);
      // 嵌套容器挂在 SUB-CONTAINERS 下（与 importArxml 的 visit 完全一致）：
      // 直接对 node 递归会漏掉所有非根容器，跨模块目标多为嵌套容器，漏掉即整模块导入失败。
      for (const children of nodes(node, 'SUB-CONTAINERS')) walk(children, path);
    }
  };
  for (const { node, packagePath } of moduleSegments(parseArxmlDocument(source).autosar)) {
    const [containers] = nodes(node, 'CONTAINERS');
    if (!containers) continue;
    walk(containers, `${packagePath}/${text(node, 'SHORT-NAME').trim()}`);
  }
  return paths;
}

export function importArxml(
  source: string,
  modules: BswmdModule[],
  onWarning?: (message: string) => void,
  /** 工程级文件中只导入该短名的模块段（G45）。 */
  onlyModule?: string,
  /** 工程级导入：整篇文档的容器路径→uuid 索引，用于解析跨模块引用目标（单模块导入不传）。 */
  externalTargets?: ReadonlyMap<string, string>
): ConfigInstance {
  const { autosar, namespace } = parseArxmlDocument(source);
  const found = moduleSegments(autosar);
  // 单模块文件必须唯一；工程级文件按选中的模块名取段（G45 多模块导入）。
  const candidates = onlyModule
    ? found.filter((item) => text(item.node, 'SHORT-NAME').trim() === onlyModule)
    : found;
  if (candidates.length !== 1)
    throw onlyModule
      ? new Error(`文件中未找到模块 ${onlyModule} 的配置段`)
      : new Error('每次导入须包含且仅包含一个 ECUC 模块配置');
  const { node: moduleNode, packagePath } = candidates[0];
  const modulePath = text(moduleNode, 'DEFINITION-REF').trim();
  const release = editorData(moduleNode).get('release') ?? '4.4.0';
  const module = modules.find(
    (item) =>
      item.version === release &&
      modulePath === (item.definitionPath ?? `/AUTOSAR/EcucDefs/${item.shortName}`)
  ) ?? modules.find(
    // 第三方工具常用 `/AUTOSAR/<模块>` 简写路径；短名 + 版本唯一即可认定同一模块定义。
    (item) => item.version === release && modulePath.endsWith(`/${item.shortName}`)
  );
  if (!module) throw new Error(`未加载模块定义：${modulePath} (${release})；不能跨版本套用定义`);
  const paths = definitionPaths(module);
  const targets = new Map<string, string>();
  const pending: { ref: ConfigReferenceValue; paths: string[] }[] = [];
  const seenIds = new Set<string>();
  const uuid = (node: XmlNode): string => {
    const value = node['@_UUID'] === undefined ? generateUUID() : string(node['@_UUID'], 'UUID');
    if (seenIds.has(value)) throw new Error(`XML UUID 重复：${value}`);
    seenIds.add(value);
    return value;
  };
  const configUuid = uuid(moduleNode);
  const visit = (
    parent: XmlNode,
    definitions: BswmdContainer[],
    parentPath: string,
    depth: number
  ): SerializedContainer[] => {
    if (depth > 128) throw new Error('容器嵌套超过 128 层');
    return nodes(parent, 'ECUC-CONTAINER-VALUE').map((node) => {
      const name = text(node, 'SHORT-NAME');
      const path = `${parentPath}/${name}`;
      const definition = definitions.find(
        (item) => paths.get(item.uuid) === text(node, 'DEFINITION-REF').trim()
      );
      if (!definition) throw new Error(`${path}：容器定义路径不匹配`);
      const id = uuid(node);
      if (targets.has(path)) throw new Error(`${path}：实例路径重复`);
      targets.set(path, id);
      const metadata = editorData(node);
      const disabled = emptyFieldStates(metadata.get('disabledParameters'), definition.parameters);
      const emptyRefs = emptyFieldStates(metadata.get('emptyReferences'), definition.references);
      const parameterNodes = single(node, 'PARAMETER-VALUES');
      const parameters = [
        ...nodes(parameterNodes, 'ECUC-NUMERICAL-PARAM-VALUE'),
        ...nodes(parameterNodes, 'ECUC-TEXTUAL-PARAM-VALUE'),
      ].map((p) => {
        uuid(p);
        const def = definition.parameters.find(
          (item) => paths.get(item.uuid) === text(p, 'DEFINITION-REF').trim()
        );
        if (!def) throw new Error(`${path}：参数定义路径不匹配`);
        if (disabled.has(def.uuid)) throw new Error(`${path}：禁用参数同时包含 VALUE`);
        return {
          definitionRef: def.uuid,
          description: readDescription(
            p,
            metadata.get(`parameterDescription:${def.uuid}`) ?? def.description
          ),
          isConfigured: true,
          value: readValue(text(p, 'VALUE'), def),
        };
      });
      const referenceNodes = single(node, 'REFERENCE-VALUES');
      if (nodes(referenceNodes, 'ECUC-INSTANCE-REFERENCE-VALUE').length)
        throw new Error(`${path}：实例引用含上下文目标，本期不支持导入，未丢弃原始数据`);
      // G42：同一引用定义的多条 VALUE-REF 聚合为一个多值引用（顺序即文件顺序）。
      const groupedReferences = new Map<string, { ref: ConfigReferenceValue; paths: string[] }>();
      for (const r of nodes(referenceNodes, 'ECUC-REFERENCE-VALUE')) {
        uuid(r);
        const def = definition.references.find(
          (item) => paths.get(item.uuid) === text(r, 'DEFINITION-REF').trim()
        );
        if (!def) throw new Error(`${path}：引用定义路径不匹配`);
        if (emptyRefs.has(def.uuid)) throw new Error(`${path}：清空引用同时包含 VALUE-REF`);
        const entry = groupedReferences.get(def.uuid) ?? {
          ref: { definitionRef: def.uuid, targetUuid: '', targetUuids: [], isConfigured: true },
          paths: [],
        };
        entry.paths.push(text(r, 'VALUE-REF').trim());
        groupedReferences.set(def.uuid, entry);
      }
      const references = [...groupedReferences.values()].map((entry) => {
        pending.push({ ref: entry.ref, paths: entry.paths });
        return entry.ref;
      });
      // Missing XML values remain unconfigured. Suggestions are editor-only and never exported as values.
      for (const def of definition.parameters) {
        if (!parameters.some((item) => item.definitionRef === def.uuid)) {
          const field = createParameterValue(def);
          field.description = metadata.get(`parameterDescription:${def.uuid}`) ?? field.description;
          if (disabled.has(def.uuid)) {
            field.value = undefined;
            field.isConfigured = disabled.get(def.uuid)!;
          }
          parameters.push({ ...field, description: field.description });
        }
      }
      for (const def of definition.references) {
        if (!references.some((item) => item.definitionRef === def.uuid))
          references.push({
            definitionRef: def.uuid,
            targetUuid: '',
            isConfigured: emptyRefs.get(def.uuid) ?? false,
          });
      }
      // The XML object parser groups textual and numerical tags. Restore the definition's
      // semantic order after filling absent fields; keep duplicates for hydrateConfig to reject.
      const parameterOrder = new Map(definition.parameters.map((def, index) => [def.uuid, index]));
      const referenceOrder = new Map(definition.references.map((def, index) => [def.uuid, index]));
      parameters.sort(
        (a, b) => parameterOrder.get(a.definitionRef)! - parameterOrder.get(b.definitionRef)!
      );
      references.sort(
        (a, b) => referenceOrder.get(a.definitionRef)! - referenceOrder.get(b.definitionRef)!
      );
      return {
        uuid: id,
        shortName: name,
        definitionRef: definition.uuid,
        description: readDescription(node, definition.description),
        parameters,
        references,
        subContainers: visit(
          single(node, 'SUB-CONTAINERS'),
          definition.subContainers,
          path,
          depth + 1
        ),
      };
    });
  };
  const name = text(moduleNode, 'SHORT-NAME');
  const containers = visit(
    single(moduleNode, 'CONTAINERS'),
    module.containers,
    `${packagePath}/${name}`,
    0
  );
  // Resolve only after the whole forest is indexed, so forward references never depend on file ordering.
  for (const item of pending) {
    const resolved = item.paths.map((refPath) => {
      const local = targets.get(refPath);
      // 跨模块目标：本模块段内必然找不到，回落到整篇文档索引（仅工程级导入提供）。
      // 单模块导入不传 externalTargets，行为保持不变——仍然明确报错，绝不静默留空目标。
      const external = local === undefined ? externalTargets?.get(refPath) : undefined;
      if (refPath && local === undefined && external === undefined)
        throw new Error(`引用目标未包含在文件中：${refPath}`);
      return local ?? external ?? '';
    });
    // 单目标保持兼容字段（不写数组）；多目标另存数组（G42）。
    item.ref.targetUuids = resolved.length > 1 ? resolved : undefined;
    item.ref.targetUuid = resolved[0] ?? '';
  }
  const now = Date.now();
  const metadata = editorData(moduleNode);
  const result = hydrateConfig(
    {
      uuid: configUuid,
      name: metadata.get('name') ?? name,
      moduleRef: module.shortName,
      version: module.version,
      createdAt: timestampField(metadata, 'createdAt', now),
      lastModified: timestampField(metadata, 'lastModified', now),
      containers,
    },
    modules
  );
  if (namespace === LEGACY_NAMESPACE)
    onWarning?.(
      '来源为旧版本命名空间 r4.2.2（旧工具格式）；已兼容读取，再次导出使用 r4.0，模块版本仍以已加载定义为准。'
    );
  return result;
}
