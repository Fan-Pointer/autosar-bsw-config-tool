import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import localforage from 'localforage';

// TODO: Import data models
// import type { AutosarConfig } from '@/models/AutosarConfig';

const STORAGE_KEY = 'autosar-config-v1';

/**
 * Global Config Store
 * Manages the entire AUTOSAR configuration state
 */
export const useConfigStore = defineStore('config', () => {
  // State
  // const config = ref<AutosarConfig | null>(null);
  const config = ref<any>(null);
  const currentConfigSetId = ref<string | null>(null);
  const isDirty = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const hasConfig = computed(() => config.value !== null);
  const currentConfigSet = computed(() => {
    if (!config.value || !currentConfigSetId.value) return null;
    return config.value.dem?.configSets?.find(
      (cs: any) => cs.uuid === currentConfigSetId.value
    );
  });

  // Actions
  const initStorage = () => {
    localforage.config({
      name: 'AutosarBswConfigTool',
      storeName: 'config',
      description: 'AUTOSAR BSW Configuration Data',
    });
  };

  const loadConfig = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await localforage.getItem(STORAGE_KEY);
      if (data) {
        config.value = data;
      }
    } catch (err) {
      error.value = 'Failed to load config: ' + (err as Error).message;
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  };

  const saveConfig = async () => {
    if (!config.value) return;
    
    isLoading.value = true;
    error.value = null;
    try {
      // Update metadata
      config.value.metadata.lastModified = Date.now();
      await localforage.setItem(STORAGE_KEY, config.value);
      isDirty.value = false;
    } catch (err) {
      error.value = 'Failed to save config: ' + (err as Error).message;
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  };

  const markDirty = () => {
    isDirty.value = true;
  };

  // TODO: Implement config set management
  // const createConfigSet = (name: string) => { ... };
  // const deleteConfigSet = (id: string) => { ... };
  // const cloneConfigSet = (id: string, newName: string) => { ... };

  // TODO: Implement import/export
  // const importFromJson = (json: string) => { ... };
  // const exportToJson = () => { ... };
  // const exportToArxml = () => { ... };

  // Initialize
  initStorage();

  return {
    // State
    config,
    currentConfigSetId,
    isDirty,
    isLoading,
    error,
    
    // Getters
    hasConfig,
    currentConfigSet,
    
    // Actions
    loadConfig,
    saveConfig,
    markDirty,
  };
});
