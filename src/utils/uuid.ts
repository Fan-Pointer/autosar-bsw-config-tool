import { v4 as uuidv4 } from 'uuid';

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
