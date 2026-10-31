import { v4 as uuidv4 } from 'uuid';

export function generateUUID(): string {
  return uuidv4();
}

/**
 * 生成 AUTOSAR 风格的 UUID
 * 格式: ECUC:{uuid}
 */
export function generateEcucUUID(): string {
  return `ECUC:${uuidv4()}`;
}
