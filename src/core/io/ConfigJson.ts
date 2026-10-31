import type { BswmdContainer, BswmdModule, BswmdParameter } from '../bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '../config/ConfigTypes';
import type { SerializedConfig, SerializedContainer } from './IoTypes';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** Check byte size before reading files or decoding text.
 * @param bytes UTF-8 bytes or File.size.
 * @returns Nothing; throws a readable size error.
 */
export function checkImportSize(bytes: number): void {
  if (bytes > MAX_IMPORT_BYTES) throw new Error('文件超过 50 MB 上限，请拆分后再导入');
}

/** Convert exceptions at IO boundaries into a readable message.
 * @param reason Caught exception.
 * @returns Displayable error without a stack trace.
 */
export function importError(reason: unknown): string {
  return `导入失败：${reason instanceof Error ? reason.message : String(reason)}`;
}

/** Serialize all maps, metadata and explicitly disabled parameters.
 * @param config Configuration to snapshot.
 * @returns Detached JSON-compatible configuration.
 */
export function serializeConfig(config: ConfigInstance): SerializedConfig {
  const visit = (container: ConfigContainer): SerializedContainer => ({
    ...container,
    parameters: [...container.parameters.values()].map((item) => ({ ...item })),
    references: [...container.references.values()].map((item) => ({ ...item })),
    subContainers: container.subContainers.map(visit),
  });
  return {
    uuid: config.uuid,
    name: config.name,
    moduleRef: config.moduleRef,
    version: config.version,
    createdAt: config.createdAt,
    lastModified: config.lastModified,
    containers: config.containers.map(visit),
  };
}

/** Export the versioned, lossless configuration document.
 * @param config Configuration to export.
 * @returns JSON including all metadata, containers, parameter states and references.
 */
export function exportJson(config: ConfigInstance): string {
  return JSON.stringify(
    { format: 'autosar-bsw-config', formatVersion: 1, configuration: serializeConfig(config) },
    null,
    2
  );
}

/** Require a plain data object at an untrusted input boundary.
 * @param value Untrusted value.
 * @param path Error location.
 * @returns Checked property map.
 */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path}：应为对象`);
  return value as Record<string, unknown>;
}

/** Read a string without coercion.
 * @param value Untrusted value.
 * @param path Error location.
 * @param empty Whether an empty string is accepted.
 * @returns Checked string.
 */
export function string(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()))
    throw new Error(`${path}：应为${empty ? '' : '非空'}字符串`);
  return value;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}：应为数组`);
  return value;
}
function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${path}：时间戳无效`);
  return value;
}
function parameterValue(value: unknown, definition: BswmdParameter, path: string): unknown {
  if (value === undefined) return undefined;
  const valid =
    definition.type === 'BOOLEAN'
      ? typeof value === 'boolean'
      : definition.type === 'INTEGER'
        ? typeof value === 'number' && Number.isSafeInteger(value)
        : definition.type === 'FLOAT'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === 'string';
  if (!valid) throw new Error(`${path}：参数类型与 ${definition.type} 不符`);
  // Business constraints remain visible in the validator; exporting an unfinished set is allowed.
  return value;
}

/** Validate serialized input against the loaded definition tree and hydrate fresh Maps.
 * @param raw Untrusted configuration object.
 * @param modules Available BSWMD modules.
 * @returns Independently owned configuration; no input object is retained.
 */
export function hydrateConfig(raw: unknown, modules: BswmdModule[]): ConfigInstance {
  const data = record(raw, '配置');
  const moduleRef = string(data.moduleRef, 'moduleRef');
  const version = string(data.version, 'version');
  const module = modules.find((item) => item.shortName === moduleRef && item.version === version);
  if (!module) throw new Error(`未加载 BSWMD：${moduleRef} (${version})`);
  const occurrences = new Map<unknown, number>();
  const pending: { value: unknown; depth: number }[] = [{ value: data, depth: 0 }];
  while (pending.length) {
    const item = pending.pop()!;
    if (!item.value || typeof item.value !== 'object') continue;
    if (item.depth > 400) throw new Error('容器嵌套超过 128 层');
    const fields = item.value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(fields, 'definitionRef'))
      occurrences.set(fields.definitionRef, (occurrences.get(fields.definitionRef) ?? 0) + 1);
    for (const value of Object.values(fields)) pending.push({ value, depth: item.depth + 1 });
  }
  const definitionError = (
    path: string,
    actual: unknown,
    expected: string[],
    kind: string
  ): Error => {
    const reason =
      kind === '容器' ? '未知或不属于该父容器的 definitionRef' : `${kind} definitionRef 未知或重复`;
    return new Error(
      `${path}：${reason}；实际值 ${String(actual)}；期望值 ${expected.join(', ') || '无'}；出现次数 ${occurrences.get(actual) ?? 0}`
    );
  };
  const ids = new Set<string>();
  const identity = (value: unknown, path: string): string => {
    const id = string(value, path);
    if (ids.has(id)) throw new Error(`${path}：UUID 重复 ${id}`);
    ids.add(id);
    return id;
  };
  const uuid = identity(data.uuid, '配置.uuid');
  const visit = (
    rawChildren: unknown,
    definitions: BswmdContainer[],
    parent: string,
    depth: number
  ): ConfigContainer[] => {
    // Bound recursion before descending, including JSON produced outside this application.
    if (depth > 128) throw new Error('容器嵌套超过 128 层');
    const names = new Set<string>();
    return array(rawChildren, parent + '.containers').map((rawChild) => {
      const child = record(rawChild, parent);
      const name = string(child.shortName, parent + '.shortName');
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        throw new Error(`${parent}/${name}：实例名称无效`);
      if (names.has(name)) throw new Error(`${parent}/${name}：同级实例名称重复`);
      names.add(name);
      const path = `${parent}/${name}`;
      const definition = definitions.find((item) => item.uuid === child.definitionRef);
      if (!definition)
        throw definitionError(
          path,
          child.definitionRef,
          definitions.map((item) => item.uuid),
          '容器'
        );
      const parameters: ConfigContainer['parameters'] = new Map();
      for (const rawParameter of array(child.parameters, path + '.parameters')) {
        const p = record(rawParameter, path);
        const def = definition.parameters.find((item) => item.uuid === p.definitionRef);
        if (!def || parameters.has(def.uuid))
          throw definitionError(
            path,
            p.definitionRef,
            definition.parameters.map((item) => item.uuid),
            '参数'
          );
        if (typeof p.isConfigured !== 'boolean')
          throw new Error(`${path}/${def.shortName}：isConfigured 应为布尔值`);
        parameters.set(def.uuid, {
          definitionRef: def.uuid,
          value: parameterValue(p.value, def, path + '/' + def.shortName),
          isConfigured: p.isConfigured,
        });
      }
      const references: ConfigContainer['references'] = new Map();
      for (const rawReference of array(child.references, path + '.references')) {
        const ref = record(rawReference, path);
        const def = definition.references.find((item) => item.uuid === ref.definitionRef);
        if (!def || references.has(def.uuid))
          throw definitionError(
            path,
            ref.definitionRef,
            definition.references.map((item) => item.uuid),
            '引用'
          );
        references.set(def.uuid, {
          definitionRef: def.uuid,
          targetUuid: string(ref.targetUuid, path + '/' + def.shortName, true),
        });
      }
      return {
        uuid: identity(child.uuid, path + '.uuid'),
        definitionRef: definition.uuid,
        shortName: name,
        ...(child.description === undefined
          ? {}
          : { description: string(child.description, path + '.description', true) }),
        parameters,
        references,
        subContainers: visit(child.subContainers, definition.subContainers, path, depth + 1),
      };
    });
  };
  return {
    uuid,
    moduleRef,
    version,
    ...(data.name === undefined ? {} : { name: string(data.name, 'name', true) }),
    createdAt: timestamp(data.createdAt, 'createdAt'),
    lastModified: timestamp(data.lastModified, 'lastModified'),
    containers: visit(data.containers, module.containers, '', 0),
  };
}

/** Parse a versioned JSON export without changing the current project.
 * @param text UTF-8 JSON document.
 * @param modules Loaded definitions.
 * @returns Validated standalone configuration.
 */
export function importJson(text: string, modules: BswmdModule[]): ConfigInstance {
  checkImportSize(new TextEncoder().encode(text).byteLength);
  const raw: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  const data = record(raw, 'JSON');
  if (data.format !== 'autosar-bsw-config' || data.formatVersion !== 1)
    throw new Error('不支持的 JSON 配置格式或版本');
  return hydrateConfig(data.configuration, modules);
}
