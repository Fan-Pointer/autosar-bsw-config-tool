#!/usr/bin/env node
/**
 * 发布产物资源 URL 改写：平台网关只放行携带 `?sharecode=` 的请求，
 * 而 Vite 产出的资源引用是不带参数的绝对路径，会全部 403 导致白屏。
 *
 * 做法：把 dist 中 HTML/JS/CSS 对 /assets/ 的引用统一追加 sharecode。
 * 不改源码，只在发布目录执行；sharecode 变更时重跑即可。
 *
 * 用法：node scripts/rewrite-sharecode.mjs <dist目录> [sharecode]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = process.argv[2];
const code = process.argv[3] ?? 'JBNIKOXRCN';
if (!dist) {
  console.error('用法: node scripts/rewrite-sharecode.mjs <dist目录> [sharecode]');
  process.exit(1);
}
const suffix = `?sharecode=${code}`;

/** HTML/CSS 中的属性型资源引用。 */
function patchAttributes(text) {
  return text
    .replace(/(src|href)="(\/assets\/[^"?]+)"/g, (_, attr, path) => `${attr}="${path}${suffix}"`)
    // 根目录静态资源（favicon 等）同样需要 sharecode，否则 403。
    .replace(/(href)="(\/[^"?\/]+\.(?:svg|ico|png|webmanifest))"/g, (_, attr, path) => `${attr}="${path}${suffix}"`);
}
/** CSS url() 引用。 */
function patchCssUrl(text) {
  return text.replace(/url\((["']?)(\/assets\/[^"')?]+)\1\)/g, (_, quote, path) => `url(${quote}${path}${suffix}${quote})`);
}
/** JS 中的相对 chunk 引用（动态 import 与静态 import 声明）。 */
function patchJsImports(text) {
  return text
    .replace(/(from\s*")(\.\/[^"?]+\.(?:js|css))(")/g, (_, open, path, close) => `${open}${"/assets/" + path.slice(2)}${suffix}${close}`)
    .replace(/(import\(\s*")(\.\/[^"?]+\.(?:js|css))(")/g, (_, open, path, close) => `${open}${"/assets/" + path.slice(2)}${suffix}${close}`)
    .replace(/(from\s*')(\.\/[^'"?]+\.(?:js|css))(')/g, (_, open, path, close) => `${open}${"/assets/" + path.slice(2)}${suffix}${close}`)
    .replace(/(import\(\s*')(\.\/[^'"?]+\.(?:js|css))(')/g, (_, open, path, close) => `${open}${"/assets/" + path.slice(2)}${suffix}${close}`);
}

let files = 0;
/** @param {string} dir 目录 */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = extname(name);
    if (!['.html', '.js', '.css', '.mjs'].includes(ext)) continue;
    const before = readFileSync(full, 'utf8');
    let after = before;
    if (ext === '.html' || ext === '.css') after = patchCssUrl(patchAttributes(after));
    if (ext === '.js' || ext === '.mjs') after = patchCssUrl(patchJsImports(after));
    if (after !== before) {
      writeFileSync(full, after);
      files += 1;
    }
  }
}
walk(dist);
console.log(`资源 URL 已追加 ${suffix}：${files} 个文件`);
