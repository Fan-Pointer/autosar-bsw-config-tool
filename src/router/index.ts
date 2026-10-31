import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
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
