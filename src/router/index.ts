import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/configurator',
    name: 'ConfiguratorStart',
    component: () => import('@/views/ConfiguratorStartView.vue'),
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('@/views/PendingView.vue'),
    props: { title: '知识库' },
  },
  {
    path: '/subscription',
    name: 'Subscription',
    component: () => import('@/views/PendingView.vue'),
    props: { title: '订阅中心' },
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/workspace',
    name: 'Workspace',
    component: () => import('@/views/WorkspaceView.vue'),
  },
  {
    path: '/wizard',
    name: 'Wizard',
    component: () => import('@/views/WizardView.vue'),
  },
  {
    path: '/import-export',
    name: 'ImportExport',
    component: () => import('@/views/ImportExportView.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
