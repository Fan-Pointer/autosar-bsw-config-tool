/** Stable module identity shared by caches and presentation preferences.
 * @param name Module short name. @param release AUTOSAR release. @returns Collision-free key.
 */
export function moduleKey(name: string, release = '4.4.0'): string {
  return JSON.stringify([name, release]);
}
