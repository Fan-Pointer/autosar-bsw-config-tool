import { describe, expect, it } from 'vitest';
import { placeContainerMenu } from '../src/ui/ConfigTree/containerMenuPosition';

describe('measured context menu placement', () => {
  it.each([1366, 1400, 683, 700])(
    'flips parent/child menus inside a %i CSS-pixel viewport (including 200%% zoom)',
    (width) => {
      const viewport = { width, height: 450 };
      for (const size of [
        { width: 296, height: 280 },
        { width: 360, height: 434 },
      ]) {
        const result = placeContainerMenu(
          { x: width - 5, y: 445, left: width - 296 },
          size,
          viewport
        );
        expect(result.left).toBeGreaterThanOrEqual(8);
        expect(result.top).toBeGreaterThanOrEqual(8);
        expect(result.left + size.width).toBeLessThanOrEqual(width - 8);
        expect(result.top + size.height).toBeLessThanOrEqual(viewport.height - 8);
        expect(result.left).toBeLessThan(width - 296);
      }
    }
  );
  it('keeps normal placement and clamps negative pointer coordinates', () => {
    expect(
      placeContainerMenu(
        { x: 200, y: 100 },
        { width: 296, height: 280 },
        { width: 1366, height: 768 }
      )
    ).toEqual({ left: 200, top: 100 });
    expect(
      placeContainerMenu(
        { x: -4, y: -10 },
        { width: 296, height: 280 },
        { width: 1366, height: 768 }
      )
    ).toEqual({ left: 8, top: 8 });
  });
});
