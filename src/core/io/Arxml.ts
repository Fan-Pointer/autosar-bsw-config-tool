import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { decodeXmlText, stripDoctype } from './XmlSafety';
import type { BswmdContainer, BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import { collectContainers } from '../config/ConfigTraversal';
import { generateUUID } from '@/utils/uuid';
import { checkImportSize, hydrateConfig, record, serializeConfig, string } from './ConfigJson';
import type { SerializedContainer } from './IoTypes';

export const AUTOSAR_NAMESPACE = 'http://autosar.org/schema/r4.2.2';
type XmlNode = Record<string, unknown>;

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
function definitionPaths(module: BswmdModule): Map<string, string> {
  const paths = new Map<string, string>();
  const visit = (definitions: BswmdContainer[], parent: string): void => {
    for (const definition of definitions) {
      const path = `${parent}/${definition.shortName}`;
      paths.set(definition.uuid, path);
      for (const field of [...definition.parameters, ...definition.references])
        paths.set(field.uuid, `${path}/${field.shortName}`);
      visit(definition.subContainers, path);
    }
  };
  visit(module.containers, `/AUTOSAR/EcucDefs/${module.shortName}`);
  return paths;
}
function parameterDest(type: BswmdParameter['type']): string {
  return `ECUC-${{ INTEGER: 'INTEGER', FLOAT: 'FLOAT', BOOLEAN: 'BOOLEAN', ENUM: 'ENUMERATION', STRING: 'STRING', FUNCTION: 'FUNCTION-NAME', REFERENCE: 'STRING' }[type]}-PARAM-DEF`;
}

/** Export the loaded ECUC value tree with definition paths and instance references.
 * @param config Configuration to export.
 * @param module Matching BSWMD module.
 * @returns Escaped AUTOSAR r4.2.2 XML.
 */
export function exportArxml(config: ConfigInstance, module: BswmdModule): string {
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
        const parameters = [...container.parameters.values()]
          .filter((p) => p.value !== undefined)
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
        const references = [...container.references.values()]
          .filter((ref) => ref.targetUuid)
          .map((ref) => {
            const target = instancePaths.get(ref.targetUuid);
            if (!target) throw new Error(`${container.shortName}：引用目标不存在，无法导出 ARXML`);
            return `<ECUC-REFERENCE-VALUE UUID="${generateUUID()}">${defRef(ref.definitionRef, 'ECUC-REFERENCE-DEF')}<VALUE-REF DEST="ECUC-CONTAINER-VALUE">${escapeXml(target)}</VALUE-REF></ECUC-REFERENCE-VALUE>`;
          })
          .join('');
        return `<ECUC-CONTAINER-VALUE UUID="${escapeXml(container.uuid)}">${tag('SHORT-NAME', container.shortName)}${defRef(definition.uuid, 'ECUC-PARAM-CONF-CONTAINER-DEF')}<PARAMETER-VALUES>${parameters}</PARAMETER-VALUES><REFERENCE-VALUES>${references}</REFERENCE-VALUES><SUB-CONTAINERS>${containers(container.subContainers, definition.subContainers)}</SUB-CONTAINERS></ECUC-CONTAINER-VALUE>`;
      })
      .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<AUTOSAR xmlns="${AUTOSAR_NAMESPACE}"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Config</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES UUID="${escapeXml(checked.uuid)}">${tag('SHORT-NAME', module.shortName)}<DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR/EcucDefs/${escapeXml(module.shortName)}</DEFINITION-REF><IMPLEMENTATION-CONFIG-VARIANT>VARIANT-PRE-COMPILE</IMPLEMENTATION-CONFIG-VARIANT><CONTAINERS>${containers(checked.containers, module.containers)}</CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
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
 * @returns Validated standalone configuration with resolved forward references.
 */
export function importArxml(source: string, modules: BswmdModule[]): ConfigInstance {
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
  if (root['@_xmlns' + prefix] !== AUTOSAR_NAMESPACE)
    throw new Error('ARXML 命名空间须为 AUTOSAR r4.2.2');
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
  const module = modules.find((item) => modulePath === `/AUTOSAR/EcucDefs/${item.shortName}`);
  if (!module) throw new Error(`未加载模块定义：${modulePath}`);
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
        return {
          definitionRef: def.uuid,
          isConfigured: true,
          value: readValue(text(p, 'VALUE'), def),
        };
      });
      const references = nodes(single(node, 'REFERENCE-VALUES'), 'ECUC-REFERENCE-VALUE').map(
        (r) => {
          uuid(r);
          const def = definition.references.find(
            (item) => paths.get(item.uuid) === text(r, 'DEFINITION-REF').trim()
          );
          if (!def) throw new Error(`${path}：引用定义路径不匹配`);
          const ref = { definitionRef: def.uuid, targetUuid: '' };
          pending.push({ ref, path: text(r, 'VALUE-REF').trim() });
          return ref;
        }
      );
      // Missing XML values mean unconfigured fields, not permission to silently reinstate BSWMD defaults.
      for (const def of definition.parameters) {
        if (!parameters.some((item) => item.definitionRef === def.uuid))
          parameters.push({ definitionRef: def.uuid, isConfigured: true, value: undefined });
      }
      for (const def of definition.references) {
        if (!references.some((item) => item.definitionRef === def.uuid))
          references.push({ definitionRef: def.uuid, targetUuid: '' });
      }
      return {
        uuid: id,
        shortName: name,
        definitionRef: definition.uuid,
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
  return hydrateConfig(
    {
      uuid: configUuid,
      name,
      moduleRef: module.shortName,
      version: module.version,
      createdAt: now,
      lastModified: now,
      containers,
    },
    modules
  );
}
