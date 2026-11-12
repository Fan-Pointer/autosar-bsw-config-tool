/** Workspace UI scene restored across reloads (G43 / FR-32).
 * Session-scoped by design: a new tab starts clean, a reload returns to the same place.
 * Only identifiers are stored; configuration data stays in the library. */
export interface WorkspaceScene {
  projectUuid?: string;
  opened: string[];
  activeUuid?: string;
  containerUuid?: string;
  fieldUuid?: string;
}

const SCENE_KEY = 'onesar-workspace-scene-v1';
const projectKey = (uuid: string) => `onesar-workspace-scene-v2:${uuid}`;

/** Read and validate a saved scene, dropping identifiers that no longer exist.
 * @param storage Session storage (window.sessionStorage or a test double).
 * @param knownSetUuids Module records belonging to the current project.
 * @param projectUuid Project owning the scene; omitted only for legacy callers.
 * @returns A usable scene, or undefined when absent/corrupt/entirely stale.
 */
export function readScene(
  storage: Pick<Storage, 'getItem'>,
  knownSetUuids: readonly string[],
  projectUuid?: string
): WorkspaceScene | undefined {
  let parsed: unknown;
  try {
    const raw =
      (projectUuid ? storage.getItem(projectKey(projectUuid)) : null) ?? storage.getItem(SCENE_KEY);
    if (!raw) return undefined;
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const value = parsed as Record<string, unknown>;
  const known = new Set(knownSetUuids);
  // A legacy global scene is usable only when its active module belongs here.
  if (
    projectUuid &&
    (value.projectUuid !== undefined
      ? value.projectUuid !== projectUuid
      : typeof value.activeUuid !== 'string' || !known.has(value.activeUuid))
  )
    return undefined;
  const opened = Array.isArray(value.opened)
    ? value.opened.filter((id): id is string => typeof id === 'string' && known.has(id))
    : [];
  const activeUuid =
    typeof value.activeUuid === 'string' && known.has(value.activeUuid)
      ? value.activeUuid
      : undefined;
  if (!opened.length && !activeUuid) return undefined;
  return {
    ...(projectUuid ? { projectUuid } : {}),
    opened,
    activeUuid,
    containerUuid:
      activeUuid && typeof value.containerUuid === 'string' ? value.containerUuid : undefined,
    fieldUuid: activeUuid && typeof value.fieldUuid === 'string' ? value.fieldUuid : undefined,
  };
}

/** Persist the current scene. Failures are ignored: a lost scene must never break editing.
 * @param storage Session storage. @param scene Scene to store.
 * @returns Nothing.
 */
export function writeScene(storage: Pick<Storage, 'setItem'>, scene: WorkspaceScene): void {
  try {
    storage.setItem(
      scene.projectUuid ? projectKey(scene.projectUuid) : SCENE_KEY,
      JSON.stringify({
        projectUuid: scene.projectUuid,
        opened: scene.opened,
        activeUuid: scene.activeUuid,
        containerUuid: scene.containerUuid,
        fieldUuid: scene.fieldUuid,
      })
    );
  } catch {
    // Quota or private-mode failures: keep editing, just do not restore next time.
  }
}
