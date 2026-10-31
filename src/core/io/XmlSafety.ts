/** Strip a complete DOCTYPE, including quoted delimiters and internal subsets.
 * This is a second barrier; the public importer still rejects files containing declarations.
 * @param source XML source. @returns XML without DOCTYPE declarations.
 */
export function stripDoctype(source: string): string {
  const declaration = /<!\s*DOCTYPE\b/gi;
  let output = '',
    offset = 0,
    match: RegExpExecArray | null;
  while ((match = declaration.exec(source))) {
    output += source.slice(offset, match.index);
    let depth = 0,
      quote = '';
    let closed = false;
    for (let i = declaration.lastIndex; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") quote = char;
      else if (char === '[') depth++;
      else if (char === ']') depth--;
      else if (char === '>' && depth === 0) {
        offset = i + 1;
        declaration.lastIndex = offset;
        closed = true;
        break;
      }
    }
    if (!closed) throw new Error('XML 格式错误：DOCTYPE 声明未闭合');
  }
  return output + source.slice(offset);
}

/** Decode XML's built-in entities once, with general entity expansion disabled.
 * @param value Parsed text or attribute. @returns Decoded scalar.
 */
export function decodeXmlText(value: string): string {
  const builtins: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return value.replace(
    /&(amp|lt|gt|quot|apos|#x[\da-f]+|#\d+);/gi,
    (match: string, key: string) => {
      if (!key.startsWith('#')) return builtins[key] ?? match;
      const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      if (!(
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      ))
        throw new Error('XML 字符引用无效');
      return String.fromCodePoint(code);
    }
  );
}
