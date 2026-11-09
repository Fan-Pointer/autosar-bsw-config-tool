import { defineStore } from 'pinia';
import localforage from 'localforage';

/**
 * G38 最小版（ADR-14）：参考数据只做「存档 + 识别 + 下载 + 删除」。
 * 解析展示将在后续版本提供（TASK-025）；本 store 不做任何伪造解析。
 */
export type ReferenceKind = 'DBC' | 'LDF' | 'CDD' | 'UNKNOWN';

export interface ReferenceFile {
  id: string;
  name: string;
  kind: ReferenceKind;
  sizeBytes: number;
  importedAt: number;
  /** 原始字节，仅用于下载原文件；不做解析。 */
  bytes: number[];
}

const STORAGE_KEY = 'autosar-reference-data';
const MAX_BYTES = 20 * 1024 * 1024;

function identify(name: string, bytes: Uint8Array): { kind: ReferenceKind; note?: string } {
  const lower = name.toLowerCase();
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 512));
  if (lower.endsWith('.dbc') || head.includes('VERSION') && head.includes('NS_'))
    return { kind: 'DBC' };
  if (lower.endsWith('.ldf') || head.includes('LIN_description_file')) return { kind: 'LDF' };
  if (lower.endsWith('.cdd')) return { kind: 'CDD', note: '专有二进制格式，解析展示待后续版本' };
  return { kind: 'UNKNOWN', note: '无法识别的参考数据格式' };
}

function generateId(): string {
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useReferenceDataStore = defineStore('referenceData', {
  state: () => ({
    files: [] as ReferenceFile[],
    loaded: false,
    lastError: '',
  }),
  actions: {
    async initialize(): Promise<void> {
      if (this.loaded) return;
      const stored = (await localforage.getItem<ReferenceFile[]>(STORAGE_KEY)) ?? [];
      this.files = stored;
      this.loaded = true;
    },
    async importFile(
      file: File
    ): Promise<{ id: string; kind: ReferenceKind; note?: string }> {
      if (file.size > MAX_BYTES) throw new Error(`文件超过 ${MAX_BYTES / 1024 / 1024}MB 上限`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!bytes.length) throw new Error('空文件无法作为参考数据存档');
      const { kind, note } = identify(file.name, bytes);
      if (kind === 'UNKNOWN')
        throw new Error(
          note ?? '无法识别的参考数据格式；支持 .dbc / .ldf / .cdd，文件将不会被存档'
        );
      const record: ReferenceFile = {
        id: generateId(),
        name: file.name,
        kind,
        sizeBytes: file.size,
        importedAt: Date.now(),
        bytes: Array.from(bytes),
      };
      this.files = [...this.files, record];
      await localforage.setItem(STORAGE_KEY, this.files);
      return { id: record.id, kind, note };
    },
    async remove(id: string): Promise<void> {
      this.files = this.files.filter((item) => item.id !== id);
      await localforage.setItem(STORAGE_KEY, this.files);
    },
    download(id: string): void {
      const record = this.files.find((item) => item.id === id);
      if (!record) throw new Error('参考文件不存在');
      const blob = new Blob([new Uint8Array(record.bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = record.name;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  },
});
