import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

/** Give definitions without source UUIDs a stable identity across repeated local imports.
 * @param path Absolute definition path. @returns Deterministic UUID v5.
 */
export function generateDefinitionUUID(path: string): string {
  return uuidv5(path, uuidv5.URL);
}

/** Generate a UUID for a configuration instance.
 * @returns A random UUID v4.
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * 生成 AUTOSAR 风格的 UUID
 * 格式: ECUC:{uuid}
 * @returns An AUTOSAR-prefixed UUID v4.
 */
export function generateEcucUUID(): string {
  return `ECUC:${uuidv4()}`;
}
