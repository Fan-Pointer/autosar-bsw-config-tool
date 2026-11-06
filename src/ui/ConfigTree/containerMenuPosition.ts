/** A context target is independent of the current form selection. */
export interface ContainerContextTarget {
  type: 'instance' | 'definition';
  containerUuid?: string;
  definitionRef?: string;
}

/** Place a measured menu beside its anchor, flipping and clamping to the visible viewport.
 * @param anchor Pointer or parent-menu edge. @param size Measured menu dimensions.
 * @param viewport Available CSS pixels (therefore also respects browser zoom).
 * @returns Non-negative fixed coordinates.
 */
export function placeContainerMenu(
  anchor: { x: number; y: number; left?: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const gap = 8;
  const maxLeft = Math.max(gap, viewport.width - size.width - gap);
  const maxTop = Math.max(gap, viewport.height - size.height - gap);
  const x =
    anchor.x + size.width + gap > viewport.width
      ? (anchor.left ?? anchor.x) - size.width
      : anchor.x;
  const y = anchor.y + size.height + gap > viewport.height ? anchor.y - size.height : anchor.y;
  return { left: Math.max(gap, Math.min(x, maxLeft)), top: Math.max(gap, Math.min(y, maxTop)) };
}
