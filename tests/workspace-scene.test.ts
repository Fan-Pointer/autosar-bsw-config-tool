import { describe, expect, it } from 'vitest';
import { readScene, writeScene } from '../src/ui/WorkspaceScene';

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('G43 workspace scene', () => {
  it('round-trips tabs, active set, container and field', () => {
    const store = storage();
    writeScene(store, {
      opened: ['set-a', 'set-b'],
      activeUuid: 'set-b',
      containerUuid: 'container-1',
      fieldUuid: 'field-1',
    });
    expect(readScene(store, ['set-a', 'set-b'])).toEqual({
      opened: ['set-a', 'set-b'],
      activeUuid: 'set-b',
      containerUuid: 'container-1',
      fieldUuid: 'field-1',
    });
  });

  it('drops identifiers for sets that no longer exist and keeps the usable rest', () => {
    const store = storage();
    writeScene(store, {
      opened: ['set-a', 'deleted-set'],
      activeUuid: 'deleted-set',
      containerUuid: 'container-1',
    });
    const scene = readScene(store, ['set-a']);
    expect(scene).toEqual({
      opened: ['set-a'],
      activeUuid: undefined,
      containerUuid: 'container-1',
      fieldUuid: undefined,
    });
  });

  it('ignores corrupt or entirely stale scenes instead of breaking the workspace', () => {
    const store = storage();
    store.setItem('onesar-workspace-scene-v1', '{not json');
    expect(readScene(store, ['set-a'])).toBeUndefined();
    store.setItem('onesar-workspace-scene-v1', JSON.stringify({ opened: ['gone'], activeUuid: 'gone' }));
    expect(readScene(store, ['set-a'])).toBeUndefined();
    expect(readScene(storage(), ['set-a'])).toBeUndefined();
  });
});
