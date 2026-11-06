import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';
import type { File } from '@vitest/runner';

/** List every test file on disk, independently of Vitest's collection result.
 * @param directory Test directory. @returns Absolute test file paths.
 */
export function diskTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? diskTestFiles(path)
      : entry.name.endsWith('.test.ts')
        ? [path]
        : [];
  });
}

/** Reject a partial collection even when all collected tests passed.
 * @param expected Test files independently found on disk.
 * @param actual Paths reported by the runner. @returns Nothing; throws on a mismatch.
 */
export function assertTestCollection(expected: string[], actual: string[]): void {
  const normalize = (path: string): string => resolve(path).replace(/\\/g, '/');
  const wanted = new Set(expected.map(normalize));
  const found = new Set(actual.map(normalize));
  const missing = [...wanted].filter((path) => !found.has(path));
  const extra = [...found].filter((path) => !wanted.has(path));
  if (missing.length || extra.length || found.size !== actual.length || !wanted.size)
    throw new Error(
      `TEST_COLLECTION_INCOMPLETE: expected ${wanted.size}, collected ${actual.length}; missing: ${missing.join(', ')}; unexpected: ${extra.join(', ')}`
    );
}

/** Full-suite delivery reporter. Enable with npm run test:verify, not focused test runs. */
export default class TestCollectionGuard implements Reporter {
  private root = process.cwd();

  /** Remember the resolved project root. @param context Runner context. @returns Nothing. */
  onInit(context: Vitest): void {
    this.root = context.config.root;
  }

  /** Verify the complete disk manifest after collection. @param files Runner files. @returns Nothing. */
  onFinished(files: File[]): void {
    try {
      assertTestCollection(
        diskTestFiles(resolve(this.root, 'tests')),
        files.map((file) => file.filepath)
      );
      const empty = files.filter((file) => !file.tasks.length);
      if (empty.length)
        throw new Error(`TEST_COLLECTION_EMPTY: ${empty.map((file) => file.filepath).join(', ')}`);
      console.log(
        `Test collection guard: ${files.length}/${files.length} disk test files collected`
      );
    } catch (error) {
      process.exitCode = 1;
      throw error;
    }
  }
}
