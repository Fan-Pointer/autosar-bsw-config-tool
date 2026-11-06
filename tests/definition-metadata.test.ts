// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BswmdParser } from '../src/core/bswmd/BswmdParser';
import type { BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { assertTestCollection, diskTestFiles } from '../scripts/test-collection-guard';

describe('definition provenance and paths', () => {
  it('preserves official source metadata and every field definition path', () => {
    const source = readFileSync(resolve('bswmd/dem_bswmd.json'), 'utf8');
    const raw = JSON.parse(source) as BswmdModule;
    const parsed = new BswmdParser().parseFromJson(source);
    const paths = (module: BswmdModule): (string | undefined)[] => {
      const visit = (items: BswmdModule['containers']): (string | undefined)[] =>
        items.flatMap((item) => [
          item.definitionPath,
          ...item.parameters.map((field) => field.definitionPath),
          ...item.references.map((field) => field.definitionPath),
          ...visit(item.subContainers),
        ]);
      return visit(module.containers);
    };
    expect(parsed.$source).toEqual(raw.$source);
    expect(parsed.$source?.sha256).toBe(
      'c01fbd950dfbb78d7c6662582d6e41f8700d13452ac169f825198a59093209bf'
    );
    expect(paths(parsed)).toEqual(paths(raw));
    expect(paths(parsed).length).toBeGreaterThan(67);
  });

  it('retains a non-default module path and rejects malformed provenance', () => {
    const parser = new BswmdParser();
    const module = parser.parseFromJson(
      JSON.stringify({
        shortName: 'Custom',
        definitionPath: '/Supplier/Platform/Custom',
        $source: { file: 'custom.arxml', extension: { release: '4.4.0' } },
        containers: [],
      })
    );
    expect(module.definitionPath).toBe('/Supplier/Platform/Custom');
    expect(module.$source).toEqual({ file: 'custom.arxml', extension: { release: '4.4.0' } });
    expect(() => parser.parseFromJson('{"shortName":"Custom","$source":[]}')).toThrow(
      'module.$source'
    );
    expect(() => parser.parseFromJson('{"shortName":"Custom","definitionPath":12}')).toThrow(
      'module.definitionPath'
    );
  });
});

describe('full-suite collection guard', () => {
  it('accepts the complete disk manifest and rejects missing, duplicate and unexpected files', () => {
    const files = diskTestFiles(resolve('tests'));
    expect(() => assertTestCollection(files, files)).not.toThrow();
    expect(() => assertTestCollection(files, files.slice(1))).toThrow('TEST_COLLECTION_INCOMPLETE');
    expect(() => assertTestCollection(files, [...files, files[0]])).toThrow(
      'TEST_COLLECTION_INCOMPLETE'
    );
    expect(() =>
      assertTestCollection(files, [...files.slice(1), resolve('tests/not-a-real-test.test.ts')])
    ).toThrow('TEST_COLLECTION_INCOMPLETE');
  });
});
