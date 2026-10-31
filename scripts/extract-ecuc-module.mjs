import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Reuse the pure TypeScript locator, with the project's existing compiler (no new dependency).
const scanner = await fs.readFile(
  new URL('../src/core/bswmd/EcucModuleSource.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(scanner, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { locateEcucModules, extractEcucModule } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

/** Extract one module without building a whole-document XML tree.
 * @param {string} input Local source path. @param {string} name Module short name.
 * @param {string} output Destination fixture path. @returns {Promise<void>} Completion.
 */
export async function extractModuleFile(input, name, output) {
  const source = await fs.readFile(input, 'utf8');
  const module = locateEcucModules(source).find((item) => item.shortName === name);
  if (!module) throw new Error(`Module not found: ${name}`);
  const result = extractEcucModule(source, module);
  await fs.writeFile(output, result, 'utf8');
  console.info(`${name}: ${Buffer.byteLength(result)} bytes -> ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, name, output] = process.argv.slice(2);
  if (!input || !name || !output)
    throw new Error(
      'Usage: node scripts/extract-ecuc-module.mjs <source.arxml> <module> <output.arxml>'
    );
  await extractModuleFile(input, name, output);
}
