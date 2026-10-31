import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import localforage from 'localforage';

import type { AutosarConfig } from '@/models/AutosarConfig';
import type { DemConfigSet } from '@/modules/dem/models/DemConfigSet';

const STORAGE_KEY = 'autosar-config-v1';

export const useConfigStore = defineStore('config', () => {
  const config = ref<AutosarConfig | null>(null);
  const currentConfigSetId = ref<string | null>(null);
  const isDirty = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasConfig = computed(() => config.value !== null);

  const currentConfigSet = computed<DemConfigSet | null>(() => {
    if (!config.value || !currentConfigSetId.value) return null;
    return (
      config.value.dem.configSets.find(
        (cs: DemConfigSet) => cs.uuid === currentConfigSetId.value
      ) ?? null
    );
  });

  const initStorage = () => {
    localforage.config({
      name: 'AutosarBswConfigTool',
      storeName: 'config',
      description: 'AUTOSAR BSW Configuration Data'
    });
  };

  const loadConfig = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = (await localforage.getItem(STORAGE_KEY)) as AutosarConfig | null;
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

  const createConfigSet = (name: string) => {
    if (!config.value) {
      config.value = {
        version: '1.0.0',
        metadata: {
          createdAt: Date.now(),
          lastModified: Date.now(),
          toolVersion: '0.1.0',
          autosarVersion: '4.2.2'
        },
        dem: { configSets: [] }
      } as AutosarConfig;
    }

    const newSet: DemConfigSet = {
      uuid: crypto.randomUUID ? crypto.randomUUID() : `cs-${Date.now()}`,
      shortName: name,
      description: '',
      version: '1.0.0',
      lastModified: Date.now(),
      demDTCs: [],
      demDTCAttributes: [],
      demEventParameters: [],
      demDebounceCounterBasedClasses: [],
      demDebounceTimeBasedClasses: [],
      demFreezeFrameClasses: [],
      demExtendedDataClasses: [],
      demOperationCycles: []
    };

    config.value.dem.configSets.push(newSet);
    currentConfigSetId.value = newSet.uuid;
    markDirty();
  };

  initStorage();

  return {
    config,
    currentConfigSetId,
    isDirty,
    isLoading,
    error,
    hasConfig,
    currentConfigSet,
    loadConfig,
    saveConfig,
    markDirty,
    createConfigSet
  };
});
