// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { importEcucModuleArxml } from '../src/core/bswmd/EcucArxmlImporter';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';

const root = resolve(__dirname, '..');
const scratchRoot = join(root, '.temp');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'task015-generator-'));
const input = join(scratch, 'official-nvm.arxml');
const output = join(scratch, 'nvm.json');
const logPath = join(scratch, 'changelog.json');
const officialSource = readFileSync(join(root, 'tests/fixtures/ecuc-nvm.arxml'), 'utf8');
writeFileSync(input, officialSource);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run() {
  return spawnSync(process.execPath, ['scripts/gen-bswmd-from-arxml.mjs', 'NvM', input, output], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
}

describe('official 4.4.0 definition extraction CLI', () => {
  it('repeats byte-for-byte, hashes content independently, and retains definition array order', () => {
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    const bytes = readFileSync(output, 'utf8');
    const log = readFileSync(logPath, 'utf8');
    const second = run();
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(bytes);
    expect(readFileSync(logPath, 'utf8')).toBe(log);
    const { $source, ...body } = JSON.parse(bytes);
    expect($source).not.toHaveProperty('generatedAt');
    // Parsed keys are already canonical; the consumer can verify the hash without the script.
    expect(
      createHash('sha256')
        .update(`${JSON.stringify(body, null, 2)}\n`)
        .digest('hex')
    ).toBe($source.contentSha256);
    const sourceModule = importEcucModuleArxml(officialSource, 'NvM');
    const generatedModule = new BswmdParser().parseFromJson(bytes);
    expect(generatedModule.containers.map((c) => c.uuid)).toEqual(
      sourceModule.containers.map((c) => c.uuid)
    );
    expect(generatedModule.containers[0].parameters.map((p) => p.shortName)).toEqual(
      sourceModule.containers[0].parameters.map((p) => p.shortName)
    );
    expect(generatedModule.version).toBe('4.4.0');
  }, 30000);

  it('records a field-level change with previous/current hashes and retains the last real change on repeat', () => {
    writeFileSync(input, officialSource);
    expect(run().status).toBe(0);
    const previous = JSON.parse(readFileSync(output, 'utf8'));
    // A controlled test mutation, never a replacement production definition source.
    writeFileSync(
      input,
      officialSource.replace(
        '<DEFAULT-VALUE>false</DEFAULT-VALUE>',
        '<DEFAULT-VALUE>true</DEFAULT-VALUE>'
      )
    );
    const changed = run();
    expect(changed.status, changed.stderr).toBe(0);
    const next = JSON.parse(readFileSync(output, 'utf8'));
    const changeBytes = readFileSync(logPath, 'utf8');
    const entry = JSON.parse(changeBytes).modules.NvM;
    expect(entry.fromContentSha256).toBe(previous.$source.contentSha256);
    expect(entry.toContentSha256).toBe(next.$source.contentSha256);
    expect(entry.toContentSha256).not.toBe(entry.fromContentSha256);
    expect(entry.changes).toHaveLength(1);
    expect(entry.changes[0]).toEqual({
      path: expect.stringMatching(/^\/containers\/[^/]+\/parameters\/[^/]+\/defaultValue$/),
      kind: 'changed',
      before: false,
      after: true,
    });
    expect(run().status).toBe(0);
    expect(readFileSync(logPath, 'utf8')).toBe(changeBytes);
  }, 30000);

  it('rejects a 4.2.2 definition before altering any existing generated artifact', () => {
    writeFileSync(input, officialSource);
    expect(run().status).toBe(0);
    const before = readFileSync(output, 'utf8');
    const log = readFileSync(logPath, 'utf8');
    writeFileSync(
      input,
      officialSource.replace(
        '<REVISION-LABEL>4.4.0</REVISION-LABEL>',
        '<REVISION-LABEL>4.2.2</REVISION-LABEL>'
      )
    );
    const rejected = run();
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain('输入模块版本为 4.2.2');
    expect(readFileSync(output, 'utf8')).toBe(before);
    expect(readFileSync(logPath, 'utf8')).toBe(log);
  }, 30000);
});
