/** 最小 ZIP 写入器（STORE 无压缩），零依赖，用于工程包下载（G44）。
 * 参考 PKWARE APPNOTE 4.3.6：本地文件头 + 中央目录 + EOCD；
 * 文件名用 UTF-8（通用位标记 0x0800），无 zip64（单文件/总量 ≤ 4GB 由调用方保证）。 */

export interface ZipEntry {
  /** 包内相对路径，使用 / 分隔。 */
  path: string;
  content: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  return table;
})();

/** CRC-32（IEEE 802.3）。 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

/**
 * 生成 ZIP 字节流。
 * @param entries 包内条目，路径重复会被后者覆盖（调用方负责唯一）。
 * @param now 打包时间，默认当前时刻（测试可注入以稳定输出）。
 * @returns 完整 zip 文件内容。
 */
export function buildZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const stamp = dosDateTime(now);
  const seen = new Set<string>();
  const payloads = entries.filter((entry) => {
    const key = entry.path.replace(/\\/g, '/');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of payloads) {
    const name = encoder.encode(entry.path.replace(/\\/g, '/'));
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 flag
    localView.setUint16(8, 0, true); // method: store
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);

    chunks.push(local, data);

    const dir = new Uint8Array(46 + name.length);
    const dirView = new DataView(dir.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(4, 20, true); // version made by
    dirView.setUint16(6, 20, true); // version needed
    dirView.setUint16(8, 0x0800, true);
    dirView.setUint16(10, 0, true);
    dirView.setUint16(12, stamp.time, true);
    dirView.setUint16(14, stamp.date, true);
    dirView.setUint32(16, crc, true);
    dirView.setUint32(20, data.length, true);
    dirView.setUint32(24, data.length, true);
    dirView.setUint16(28, name.length, true);
    dirView.setUint16(30, 0, true); // extra
    dirView.setUint16(32, 0, true); // comment
    dirView.setUint16(34, 0, true); // disk number
    dirView.setUint16(36, 0, true); // internal attrs
    dirView.setUint32(38, 0, true); // external attrs
    dirView.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, payloads.length, true);
  endView.setUint16(10, payloads.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, end]) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}
