import { onMounted, onUnmounted } from 'vue';
import { useConfigStore } from '@/stores/configStore';

/** Keep native text undo, IME composition and editable rich-text controls untouched.
 * @param event Keyboard event. @returns Whether editor history may handle it.
 */
export function isHistoryShortcut(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    !event.isComposing &&
    !event.altKey &&
    (event.ctrlKey || event.metaKey) &&
    ['z', 'y'].includes(event.key.toLowerCase()) &&
    !(
      target instanceof Element &&
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
      )
    )
  );
}

/** Register workspace-scoped shortcuts and clean up on navigation. @returns Nothing. */
export function useHistory(): void {
  const store = useConfigStore();
  const handle = (event: KeyboardEvent): void => {
    if (!isHistoryShortcut(event) || store.isImporting) return;
    const redo = event.key.toLowerCase() === 'y' || event.shiftKey;
    if (redo ? store.canRedo : store.canUndo) {
      event.preventDefault();
      if (redo) store.redo();
      else store.undo();
    }
  };
  onMounted(() => window.addEventListener('keydown', handle));
  onUnmounted(() => window.removeEventListener('keydown', handle));
}
