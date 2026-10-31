/** Byte-independent string offsets and ancestor wrappers; no unselected module object trees. */
export interface EcucModuleSlice {
  shortName: string;
  start: number;
  end: number;
  opening: string;
  closing: string;
}

/** Locate module segments using a bounded XML tag stack, skipping comments and CDATA.
 * @param source Full local ARXML text. @returns Named slices in source order.
 */
export function locateEcucModules(source: string): EcucModuleSlice[] {
  const stack: { tag: string; local: string; open: string; content: number; name?: string }[] = [];
  const modules: EcucModuleSlice[] = [];
  let current: EcucModuleSlice | undefined;
  let rootSeen = false;
  // Quotes may contain >; treating comments/CDATA atomically prevents fake module delimiters.
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w.:-]*(?:[^<>"']|"[^"]*"|'[^']*')*>/g;
  for (const match of source.matchAll(tokens)) {
    const token = match[0];
    if (token.startsWith('<!') || token.startsWith('<?')) continue;
    const tag = /^<\/?([^\s/>]+)/.exec(token)![1];
    const local = tag.split(':').pop()!;
    if (token.startsWith('</')) {
      const frame = stack.pop();
      if (!frame || frame.tag !== tag) throw new Error(`XML 标签不匹配：${tag}`);
      if (local === 'SHORT-NAME' && stack.length) {
        const name = source.slice(frame.content, match.index).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('SHORT-NAME 无效');
        stack[stack.length - 1].name = name;
      }
      if (local === 'ECUC-MODULE-DEF') {
        if (!current || !frame.name) throw new Error('模块缺少 SHORT-NAME');
        current.shortName = frame.name;
        current.end = match.index + token.length;
        modules.push(current);
        current = undefined;
      }
      continue;
    }
    if (!stack.length) {
      if (rootSeen || local !== 'AUTOSAR') throw new Error('须为单个 AUTOSAR 根节点');
      rootSeen = true;
      if (!/xmlns(?::[\w.-]+)?\s*=\s*["']http:\/\/autosar.org\/schema\/r4[.\w]*["']/.test(token))
        throw new Error('缺少 AUTOSAR 命名空间');
    }
    if (local === 'ECUC-MODULE-DEF') {
      if (current) throw new Error('模块定义不能嵌套');
      current = {
        shortName: '',
        start: match.index,
        end: 0,
        opening: stack
          .map(
            (frame) =>
              frame.open +
              (frame.local === 'AR-PACKAGE' && frame.name
                ? `<${frame.tag.replace(/AR-PACKAGE$/, 'SHORT-NAME')}>${frame.name}</${frame.tag.replace(/AR-PACKAGE$/, 'SHORT-NAME')}>`
                : '')
          )
          .join(''),
        closing: [...stack]
          .reverse()
          .map((frame) => `</${frame.tag}>`)
          .join(''),
      };
    }
    if (!token.endsWith('/>'))
      stack.push({ tag, local, open: token, content: match.index + token.length });
    if (stack.length > 300) throw new Error('XML 嵌套过深（上限 300 层）');
  }
  if (stack.length || current || !rootSeen) throw new Error('XML 未闭合或缺少根节点');
  if (new Set(modules.map((module) => module.shortName)).size !== modules.length)
    throw new Error('模块 SHORT-NAME 重复，无法唯一选择');
  return modules;
}

/** Rewrap one untouched module with its original namespace and package ancestry.
 * @param source Original ARXML. @param module Selected source slice.
 * @returns A standalone XML document containing exactly one module.
 */
export function extractEcucModule(source: string, module: EcucModuleSlice): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${module.opening}${source.slice(module.start, module.end)}${module.closing}\n`;
}
