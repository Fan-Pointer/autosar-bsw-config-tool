import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decodeXmlText, stripDoctype, withoutXmlComments } from './XmlSafety';
import type { BswmdContainer, BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { referenceDefinitionDest } from '../config/ReferenceCandidates';
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
  outputCheck?: OutputCheckResult
): string {
  assertOutputReady(outputCheck ?? evaluateOutputReadiness(config, module));
  const checked = hydrateConfig(serializeConfig(config), [module]);
  const definitions = definitionPaths(module);
  const entries = collectContainers(checked, module);
  const instancePaths = new Map(
    entries.map((entry) => [entry.container.uuid, `/Config/${module.shortName}/${entry.path}`])
  );
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
            return value ? [value] : [];
          })
          .filter((ref) => ref.isConfigured === true && ref.targetUuid)
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
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AUTOSAR xmlns="${AUTOSAR_NAMESPACE}"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Config</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES UUID="${escapeXml(checked.uuid)}">${tag('SHORT-NAME', module.shortName)}${metadata}<DEFINITION-REF DEST="ECUC-MODULE-DEF">${escapeXml(module.definitionPath ?? `/AUTOSAR/EcucDefs/${module.shortName}`)}</DEFINITION-REF><IMPLEMENTATION-CONFIG-VARIANT>VARIANT-PRE-COMPILE</IMPLEMENTATION-CONFIG-VARIANT><CONTAINERS>${containers(checked.containers, module.containers)}</CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
}

function nodes(parent: XmlNode, key: string): XmlNode[] {
  const value = parent[key];
  if (value === undefined || value === '') return [];
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
export function importArxml(
  source: string,
  modules: BswmdModule[],
  onWarning?: (message: string) => void
): ConfigInstance {
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
  const autosar = record(normalize(root), 'AUTOSAR');
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
  if (found.length !== 1) throw new Error('每次导入须包含且仅包含一个 ECUC 模块配置');
  const { node: moduleNode, packagePath } = found[0];
  const modulePath = text(moduleNode, 'DEFINITION-REF').trim();
  const release = editorData(moduleNode).get('release') ?? '4.4.0';
  const module = modules.find(
    (item) =>
      item.version === release &&
      modulePath === (item.definitionPath ?? `/AUTOSAR/EcucDefs/${item.shortName}`)
  );
  if (!module) throw new Error(`未加载模块定义：${modulePath} (${release})；不能跨版本套用定义`);
  const paths = definitionPaths(module);
  const targets = new Map<string, string>();
  const pending: { ref: { definitionRef: string; targetUuid: string }; path: string }[] = [];
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
      const references = nodes(referenceNodes, 'ECUC-REFERENCE-VALUE').map((r) => {
        uuid(r);
        const def = definition.references.find(
          (item) => paths.get(item.uuid) === text(r, 'DEFINITION-REF').trim()
        );
        if (!def) throw new Error(`${path}：引用定义路径不匹配`);
        if (emptyRefs.has(def.uuid)) throw new Error(`${path}：清空引用同时包含 VALUE-REF`);
        const ref = { definitionRef: def.uuid, targetUuid: '', isConfigured: true };
        pending.push({ ref, path: text(r, 'VALUE-REF').trim() });
        return ref;
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
    if (item.path && !targets.has(item.path))
      throw new Error(`引用目标未包含在文件中：${item.path}`);
    item.ref.targetUuid = targets.get(item.path) ?? '';
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
