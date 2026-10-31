import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import './ui/Theme/theme.css';
import { initializeTheme } from './ui/Theme/theme';

import App from './App.vue';
import router from './router';

const app = createApp(App);
initializeTheme();

// Register all icons
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus);

app.mount('#app');
