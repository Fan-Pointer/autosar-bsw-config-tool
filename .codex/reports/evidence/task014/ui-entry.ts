import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '../src/ui/Theme/theme.css';
import WorkspaceView from '../src/views/WorkspaceView.vue';
import { useConfigStore } from '../src/stores/configStore';
if (location.origin !== 'http://localhost:3001') throw new Error('Isolated test origin only');
const pinia=createPinia();
const store=useConfigStore(pinia);
// In-memory setup only: initialize() short-circuits after createConfig; no library read/write.
store.createConfig();
store.config!.name='TASK-014 未确认必填值样例（内存）';
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:WorkspaceView}]});
const app=createApp(WorkspaceView);app.use(pinia);app.use(router);app.use(ElementPlus);
await router.push('/');await router.isReady();app.mount('#app');
