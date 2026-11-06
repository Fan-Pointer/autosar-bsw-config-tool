import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import localforage from 'localforage';
import 'element-plus/dist/index.css';
import '../src/ui/Theme/theme.css';
if (location.origin !== 'http://localhost:3001') throw new Error('Isolated test origin only');
// Test-only persistence adapter; product store, lifecycle and rendering are unchanged.
const memory = new Map();
localforage.createInstance = () => ({
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: unknown) => { memory.set(key, structuredClone(value)); return value; },
}) as LocalForage;
const { default: WorkspaceView } = await import('../src/views/WorkspaceView.vue');
const { useConfigStore } = await import('../src/stores/configStore');
const pinia=createPinia();
const store=useConfigStore(pinia);
store.createConfig();
store.config!.name='TASK-016 菜单验证（内存样例）';
const root=store.config!.containers[0];
const eventDef=store.entries[0].definition.subContainers.find(item=>item.shortName==='DemEventParameter')!;
store.addContainerInstance(eventDef.uuid, root.uuid);
await store.saveConfig();
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:WorkspaceView}]});
const app=createApp(WorkspaceView);app.use(pinia);app.use(router);app.use(ElementPlus);
await router.push('/');await router.isReady();app.mount('#app');
