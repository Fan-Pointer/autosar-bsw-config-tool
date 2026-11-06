import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import localforage from 'localforage';
import 'element-plus/dist/index.css';
import '../src/ui/Theme/theme.css';
import type { BswmdContainer, BswmdModule } from '../src/core/bswmd/BswmdTypes';
import { exportArxml } from '../src/core/io/Arxml';
if (location.origin !== 'http://localhost:3001') throw new Error('Isolated test origin only');
const memory = new Map();
localforage.createInstance = () => ({
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: unknown) => { memory.set(key, structuredClone(value)); return value; },
}) as LocalForage;
const { default: WorkspaceView } = await import('../src/views/WorkspaceView.vue');
const { useConfigStore } = await import('../src/stores/configStore');
const prefix='/AUTOSAR/EcucDefs/Interop';
const leaf=(name:string):BswmdContainer=>({uuid:name,shortName:name,definitionPath:`${prefix}/${name}`,multiplicity:{lower:1,upper:1},parameters:[],references:[],subContainers:[]});
const root=leaf('Root');
root.references=[{uuid:'choice',shortName:'MemoryDestinationRef',kind:'choice',destinationRefs:[`${prefix}/FirstMemory`,`${prefix}/SecondMemory`],destinationRef:`${prefix}/FirstMemory`,destinationContainerType:'FirstMemory',isOptional:false}];
const definition:BswmdModule={shortName:'Interop',version:'4.4.0',containers:[root,leaf('FirstMemory'),leaf('SecondMemory')]};
const pinia=createPinia();
const store=useConfigStore(pinia);
await store.initialize();
await store.importModuleDefinitions([definition]);
await store.createConfigSet('TASK-015 隔离内存样例','Interop');
store.selectContainer(store.config!.containers[0].uuid);
store.setReferenceTarget('choice',store.config!.containers[1].uuid);
await store.saveConfig();
const legacy=exportArxml(store.config!,definition).replace('http://autosar.org/schema/r4.0','http://autosar.org/schema/r4.2.2');
const a=document.createElement('a');a.textContent='下载旧命名空间测试文件';a.download='task015-legacy.arxml';a.href=URL.createObjectURL(new Blob([legacy],{type:'application/xml'}));
document.getElementById('proof')!.append('仅内存测试 · ',a);
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:WorkspaceView}]});
const app=createApp(WorkspaceView);app.use(pinia);app.use(router);app.use(ElementPlus);
await router.push('/');await router.isReady();app.mount('#app');
