import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type {
  BswmdModule,
  BswmdContainer,
  BswmdParameter,
  BswmdReference,
  Multiplicity,
  ConfigClass,
} from './BswmdTypes';
import { locateEcucModules } from './EcucModuleSource';
import { decodeXmlText, stripDoctype, withoutXmlComments } from '../io/XmlSafety';
import { checkImportSize } from '../io/ConfigJson';
import { generateDefinitionUUID } from '@/utils/uuid';

type Node = Record<string, unknown>;
function node(value: unknown): Node {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : {};
}
function array(value: unknown): unknown[] {
  return value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value];
}
function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return decodeXmlText(value).trim();
  return typeof node(value)['#text'] === 'string'
    ? decodeXmlText(node(value)['#text'] as string).trim()
    : undefined;
}
function required(data: Node, key: string): string {
  const result = scalar(data[key]);
  if (!result) throw new Error(`定义缺少 ${key}`);
  return result;
}
function description(value: unknown): string {
  if (typeof value === 'string') return decodeXmlText(value).trim();
  if (Array.isArray(value)) return value.map(description).filter(Boolean).join(' ');
  return Object.entries(node(value))
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, child]) => description(child))
    .filter(Boolean)
    .join(' ');
}
function numeric(value: unknown, label: string): number | undefined {
  const text = scalar(value);
  if (text === undefined) return undefined;
  const result = Number(text);
  if (!text || !Number.isFinite(result)) throw new Error(`${label}: 数值无效 ${text}`);
  return result;
}
function multiplicity(data: Node): Multiplicity {
  const lower = numeric(data['LOWER-MULTIPLICITY'], 'LOWER-MULTIPLICITY') ?? 1;
  const upper =
    ['true', '1'].includes(scalar(data['UPPER-MULTIPLICITY-INFINITE']) ?? '') ||
    scalar(data['UPPER-MULTIPLICITY']) === '*'
      ? 'unbounded'
      : (numeric(data['UPPER-MULTIPLICITY'], 'UPPER-MULTIPLICITY') ?? 1);
  if (
    !Number.isSafeInteger(lower) ||
    lower < 0 ||
    (upper !== 'unbounded' && (!Number.isSafeInteger(upper) || upper < lower))
  )
    throw new Error('定义 multiplicity 无效');
  return { lower, upper };
}
function safeSource(source: string): string {
  checkImportSize(new TextEncoder().encode(source).byteLength);
  const clean = withoutXmlComments(source);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(clean)) throw new Error('禁止 DTD / DOCTYPE 与外部实体');
  if (/<(?:[\w.-]+:)?include\b/i.test(clean)) throw new Error('禁止 XInclude 外部引用');
  return stripDoctype(clean);
}

/** List all selectable modules without parsing any module definition tree.
 * @param source Local official ECUC ARXML. @returns Unique module names in file order.
 */
export function listEcucModuleNames(source: string): string[] {
  return locateEcucModules(safeSource(source)).map((module) => module.shortName);
}

/** Import only the requested module from a potentially multi-megabyte definition file.
 * @param source Local ARXML source. @param moduleShortName Exact module SHORT-NAME.
 * @returns Definition-driven module with explicit warnings for unsupported semantics.
 */
export function importEcucModuleArxml(source: string, moduleShortName: string): BswmdModule {
  const clean = safeSource(source);
  const slice = locateEcucModules(clean).find((module) => module.shortName === moduleShortName);
  if (!slice) throw new Error(`未找到模块定义：${moduleShortName}`);
  // Only this segment reaches fast-xml-parser; memory scales with the selected module, not all definitions.
  const fragment = clean.slice(slice.start, slice.end);
  const valid = XMLValidator.validate(fragment);
  if (valid !== true) throw new Error(`模块 XML 格式错误：${valid.err.msg}`);
  const tree: unknown = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
    trimValues: false,
  }).parse(
    fragment.replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      (_match: string, text: string) => `<![CDATA[${text.replace(/&/g, '&amp;')}]]>`
    )
  );
  const root = node(node(tree)['ECUC-MODULE-DEF']);
  const warnings: string[] = [];
  const arxmlExportBlockers: string[] = [];
  const ids = new Set<string>();
  function identity(data: Node, parent: string) {
    const shortName = required(data, 'SHORT-NAME');
    const path = `${parent}/${shortName}`;
    const uuid = scalar(data['@_UUID']) || generateDefinitionUUID(path);
    if (ids.has(uuid)) throw new Error(`重复定义 UUID：${uuid}`);
    ids.add(uuid);
    return { uuid, shortName, description: description(data.DESC) || undefined };
  }
  function parameter(data: Node, tag: string, parent: string): BswmdParameter {
    const id = identity(data, parent);
    const types: Record<string, BswmdParameter['type']> = {
      'ECUC-BOOLEAN-PARAM-DEF': 'BOOLEAN',
      'ECUC-INTEGER-PARAM-DEF': 'INTEGER',
      'ECUC-FLOAT-PARAM-DEF': 'FLOAT',
      'ECUC-ENUMERATION-PARAM-DEF': 'ENUM',
      'ECUC-STRING-PARAM-DEF': 'STRING',
      'ECUC-FUNCTION-NAME-DEF': 'FUNCTION',
    };
    const type = types[tag];
    if (!type) throw new Error(`${id.shortName}: 不支持的参数类型 ${tag}`);
    const variants = array(node(data[`${tag}-VARIANTS`])[`${tag}-CONDITIONAL`]);
    if (variants.length > 1)
      throw new Error(`${id.shortName}: 多个条件变体尚不支持，请先选择单一变体定义`);
    const constraints = { ...data, ...node(variants[0]) };
    const classes = array(node(data['VALUE-CONFIG-CLASSES'])['ECUC-VALUE-CONFIGURATION-CLASS']).map(
      (item) => scalar(node(item)['CONFIG-CLASS'])
    );
    const configClass: ConfigClass = classes.includes('PRE-COMPILE')
      ? 'PRE_COMPILE'
      : classes.includes('LINK')
        ? 'LINK_TIME'
        : classes.includes('POST-BUILD')
          ? 'POST_BUILD'
          : 'PRE_COMPILE';
    const bounds = multiplicity(data);
    if (bounds.upper === 'unbounded' || bounds.upper > 1)
      warnings.push(`${id.shortName}：多值参数的 multiplicity 已保留，当前编辑器只编辑一个值。`);
    const rawDefault = scalar(constraints['DEFAULT-VALUE']);
    let defaultValue: unknown = rawDefault;
    if (rawDefault !== undefined) {
      if (type === 'BOOLEAN') {
        if (!['true', 'false', '0', '1'].includes(rawDefault))
          throw new Error(`${id.shortName}: 布尔默认值无效`);
        defaultValue = rawDefault === 'true' || rawDefault === '1';
      } else if (type === 'INTEGER' || type === 'FLOAT')
        defaultValue = numeric(rawDefault, id.shortName);
    }
    const enumValues =
      type === 'ENUM'
        ? array(node(data.LITERALS)['ECUC-ENUMERATION-LITERAL-DEF']).map((item) =>
            required(node(item), 'SHORT-NAME')
          )
        : undefined;
    // Official floating bounds use -Inf/Inf. An absent bound carries the same domain and survives JSON persistence.
    const min =
      type === 'FLOAT' && /^-inf(?:inity)?$/i.test(scalar(constraints.MIN) ?? '')
        ? undefined
        : numeric(constraints.MIN, id.shortName);
    const max =
      type === 'FLOAT' && /^\+?inf(?:inity)?$/i.test(scalar(constraints.MAX) ?? '')
        ? undefined
        : numeric(constraints.MAX, id.shortName);
    if (min !== undefined && max !== undefined && min > max)
      throw new Error(`${id.shortName}: MIN > MAX`);
    if (
      type === 'ENUM' &&
      (!enumValues?.length || (rawDefault !== undefined && !enumValues.includes(rawDefault)))
    )
      throw new Error(`${id.shortName}: 枚举列表或默认值无效`);
    if (
      typeof defaultValue === 'number' &&
      ((type === 'INTEGER' && !Number.isSafeInteger(defaultValue)) ||
        (min !== undefined && defaultValue < min) ||
        (max !== undefined && defaultValue > max))
    )
      throw new Error(`${id.shortName}: 默认值超出范围`);
    return {
      ...id,
      type,
      configClass,
      multiplicity: bounds,
      isOptional: bounds.lower === 0,
      defaultValue,
      min,
      max,
      enumValues,
      minLength: numeric(constraints['MIN-LENGTH'], id.shortName),
      maxLength: numeric(constraints['MAX-LENGTH'], id.shortName),
      regularExpression: scalar(constraints['REGULAR-EXPRESSION']),
    };
  }
  function reference(data: Node, tag: string, parent: string): BswmdReference {
    const id = identity(data, parent);
    // Ordinary references carry one DESTINATION-REF; choice references carry a DESTINATION-REFS list.
    // Foreign and instance references point outside this module and stay read-only in the editor.
    const kind: BswmdReference['kind'] =
      tag === 'ECUC-CHOICE-REFERENCE-DEF'
        ? 'choice'
        : tag === 'ECUC-FOREIGN-REFERENCE-DEF'
          ? 'foreign'
          : tag === 'ECUC-INSTANCE-REFERENCE-DEF'
            ? 'instance'
            : 'reference';
    if (
      tag !== 'ECUC-REFERENCE-DEF' &&
      tag !== 'ECUC-CHOICE-REFERENCE-DEF' &&
      tag !== 'ECUC-FOREIGN-REFERENCE-DEF' &&
      tag !== 'ECUC-INSTANCE-REFERENCE-DEF'
    )
      throw new Error(`${id.shortName}: 不支持的引用类型 ${tag}`);

    const destinations: string[] =
      kind === 'choice'
        ? array(node(data['DESTINATION-REFS'])['DESTINATION-REF']).map((item) =>
            String(scalar(item) ?? '').trim()
          )
        : kind === 'reference'
          ? [required(data, 'DESTINATION-REF')]
          : // FOREIGN and INSTANCE references carry no static DESTINATION-REF in the official
            // definitions; their target is resolved outside this module at runtime.
            [];
    const destinationRefs = destinations.filter((item) => item.length > 0);
    // Choice references must name at least one candidate; ordinary ones a single target.
    if (kind === 'reference' && !destinationRefs.length)
      throw new Error(`${id.shortName}: 引用缺少目标定义`);
    if (kind === 'choice' && !destinationRefs.length)
      throw new Error(`${id.shortName}: CHOICE 引用缺少候选目标`);
    const destinationRef = destinationRefs[0];
    const isExternal =
      kind === 'foreign' ||
      kind === 'instance' ||
      destinationRefs.some((target) => !target.startsWith(`/AUTOSAR/EcucDefs/${moduleShortName}/`));

    const bounds = multiplicity(data);
    if (bounds.upper === 'unbounded' || bounds.upper > 1)
      warnings.push(`${id.shortName}：多值引用的 multiplicity 已保留，当前编辑器只编辑一个目标。`);
    if (!destinationRefs.length)
      warnings.push(`${id.shortName}：${kind} 引用无静态目标（${kind === 'foreign' ? '跨模块' : '实例'}引用），编辑器只读展示。`);
    else if (isExternal)
      warnings.push(`${id.shortName}：目标 ${destinationRef} 位于本模块之外；编辑器只读展示。`);
    else if (kind === 'choice')
      warnings.push(`${id.shortName}：多候选引用，可在 ${destinationRefs.length} 个候选目标中选一个。`);

    return {
      ...id,
      destinationRef,
      destinationRefs,
      kind,
      isExternal,
      destinationContainerType: destinationRef ? destinationRef.split('/').pop()! : id.shortName,
      multiplicity: bounds,
      isOptional: bounds.lower === 0,
    };
  }
  function definitions(
    parent: Node,
    parse: (data: Node, tag: string) => BswmdParameter
  ): BswmdParameter[];
  function definitions(
    parent: Node,
    parse: (data: Node, tag: string) => BswmdReference
  ): BswmdReference[];
  function definitions<T>(parent: Node, parse: (data: Node, tag: string) => T): T[] {
    return Object.entries(parent)
      .filter(([tag]) => !tag.startsWith('@_') && tag !== '#text')
      .flatMap(([tag, values]) => array(values).map((value) => parse(node(value), tag)));
  }
  function containers(parent: Node, path: string, depth: number): BswmdContainer[] {
    if (depth > 128) throw new Error('容器层级超过 128');
    return Object.entries(parent)
      .filter(([tag]) => !tag.startsWith('@_') && tag !== '#text')
      .flatMap(([tag, values]) =>
        array(values).map((value) => {
          if (!['ECUC-PARAM-CONF-CONTAINER-DEF', 'ECUC-CHOICE-CONTAINER-DEF'].includes(tag))
            throw new Error(`不支持的容器类型：${tag}`);
          const data = node(value),
            id = identity(data, path),
            childPath = `${path}/${id.shortName}`;
          if (tag === 'ECUC-CHOICE-CONTAINER-DEF') {
            warnings.push(`${id.shortName}：CHOICE 分组需选择一个候选后导出；切换候选可撤销。`);
          }
          const subContainers = containers(
            node(tag === 'ECUC-CHOICE-CONTAINER-DEF' ? data.CHOICES : data['SUB-CONTAINERS']),
            childPath,
            depth + 1
          );
          if (tag === 'ECUC-CHOICE-CONTAINER-DEF' && !subContainers.length)
            throw new Error(`${id.shortName}: CHOICE 缺少候选`);
          return {
            ...id,
            ...(tag === 'ECUC-CHOICE-CONTAINER-DEF'
              ? { choice: { candidateRefs: subContainers.map((child) => child.uuid) } }
              : {}),
            definitionPath: childPath,
            multiplicity: multiplicity(data),
            parameters: definitions(
              node(data.PARAMETERS ?? data['PARAMETER-DEFS']),
              (child, kind) => parameter(child, kind, childPath)
            ),
            references: definitions(
              node(data.REFERENCES ?? data['REFERENCE-DEFS']),
              (child, kind) => reference(child, kind, childPath)
            ),
            subContainers,
          };
        })
      );
  }
  const revision = node(node(node(root['ADMIN-DATA'])['DOC-REVISIONS'])['DOC-REVISION']);
  return {
    shortName: required(root, 'SHORT-NAME'),
    version: scalar(revision['REVISION-LABEL']) ?? 'unknown',
    description: description(root.DESC) || undefined,
    multiplicity: multiplicity(root),
    containers: containers(node(root.CONTAINERS), `/AUTOSAR/EcucDefs/${moduleShortName}`, 0),
    importWarnings: warnings,
    arxmlExportBlockers,
  };
}
