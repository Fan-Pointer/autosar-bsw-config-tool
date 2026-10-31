// @vitest-environment node
import { it, expect } from 'vitest';
import { resolveConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

it('D1: resolves Vite root cache inside the workspace and removes the ignored test.cacheDir', async () => {
  const resolved = await resolveConfig({ configFile: resolve('vite.config.ts') }, 'serve');
  expect(resolved.cacheDir.replace(/\\/g, '/')).toBe(
    resolve('.temp/vite-cache').replace(/\\/g, '/')
  );
  expect(readFileSync('vite.config.ts', 'utf8')).not.toMatch(/test:\s*{\s*cacheDir/);
});
