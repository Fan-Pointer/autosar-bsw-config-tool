import { ref } from 'vue';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'autosar-theme';
export const theme = ref<Theme>('light');

/** Restore only a recognized local preference. @returns Applied theme. */
export function initializeTheme(): Theme {
  try {
    theme.value = localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    theme.value = 'light';
  }
  document.documentElement.dataset.theme = theme.value;
  return theme.value;
}

/** Change presentation without touching the configuration or selected instances.
 * @param value Desired theme. @returns Nothing.
 */
export function setTheme(value: Theme): void {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Keep the current session usable when storage is unavailable. */
  }
}
