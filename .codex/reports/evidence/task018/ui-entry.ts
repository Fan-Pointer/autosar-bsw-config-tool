import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import ElementPlus from 'element-plus';
import localforage from 'localforage';
import 'element-plus/dist/index.css';
import '../src/ui/Theme/theme.css';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';

if (location.origin !== 'http://localhost:3001') throw new Error('Isolated test origin only');
const memory = new Map();
localforage.createInstance = () => ({
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: unknown) => { memory.set(key, structuredClone(value)); return value; },
}) as LocalForage;
const { default: WorkspaceView } = await import('../src/views/WorkspaceView.vue');
const { useConfigStore } = await import('../src/stores/configStore');
const pinia=createPinia(); const store=useConfigStore(pinia);
await store.initialize(); await store.createConfigSet('TASK-018 隔离内存验收');
store.confirmRequiredDefaults();
const selected=store.entries.find(entry=>entry.definition.shortName==='DemEventParameter');
if(selected)store.selectContainer(selected.container.uuid);
await store.saveConfig();
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:WorkspaceView}]});
const app=createApp({render:()=>h(RouterView)}); app.use(pinia); app.use(router); app.use(ElementPlus);
await router.push('/'); await router.isReady(); app.mount('#app');