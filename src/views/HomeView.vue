<template>
  <div class="home-container">
    <RecoveryPanel />
    <div class="hero-section">
      <h1 class="title">AUTOSAR BSW Config Tool</h1>
      <p class="subtitle">基于网页的 AUTOSAR 基础软件配置工具</p>

      <ConfigSetManager @opened="router.push('/workspace')" />
      <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
    </div>

    <div class="recent-section" v-if="store.summaries.length">
      <h2>本机配置集</h2>
      <el-table :data="store.summaries" style="width: 100%">
        <el-table-column prop="name" label="配置名称" />
        <el-table-column prop="module" label="模块" />
        <el-table-column label="修改时间">
          <template #default="{ row }">{{
            new Date(row.lastModified).toLocaleString('zh-CN')
          }}</template>
        </el-table-column>
        <el-table-column prop="containerCount" label="容器数" />
        <el-table-column prop="errorCount" label="错误数" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="store.isLoading" @click="openSet(row.uuid)"
              >打开</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="features-section">
      <h2>功能特性</h2>
      <el-row :gutter="20">
        <el-col :span="8">
          <el-card>
            <template #header>
              <el-icon><Edit /></el-icon>
              可视化配置
            </template>
            <p>从模块定义生成配置树、参数表单和引用选择</p>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card>
            <template #header>
              <el-icon><Document /></el-icon>
              C 代码生成
            </template>
            <p>校验配置后生成模块头文件和配置源文件</p>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card>
            <template #header>
              <el-icon><Lock /></el-icon>
              纯前端实现
            </template>
            <p>无需后端，数据本地存储，离线可用</p>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div class="footer">
      <p>版本 0.1.0 | 支持 AUTOSAR Classic Platform 4.2.2</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { Edit, Document, Lock } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { useConfigStore } from '@/stores/configStore';
import ConfigSetManager from '@/ui/ConfigSets/ConfigSetManager.vue';
import RecoveryPanel from '@/ui/ConfigSets/RecoveryPanel.vue';

const router = useRouter();
const store = useConfigStore();
onMounted(() => {
  void store.initialize();
});
async function openSet(uuid: string): Promise<void> {
  if (await store.switchConfigSet(uuid).catch(() => false)) await router.push('/workspace');
}
</script>

<style scoped>
.home-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}

.hero-section {
  text-align: center;
  padding: 60px 0;
}

.title {
  font-size: 48px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.subtitle {
  font-size: 20px;
  color: var(--color-text);
  margin-bottom: 40px;
}

.actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.actions .el-button {
  padding: 0 32px;
  height: 48px;
  font-size: 16px;
}

.recent-section {
  margin: 60px 0;
}

.recent-section h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: var(--color-text);
}

.features-section {
  margin: 60px 0;
}

.features-section h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: var(--color-text);
}

.features-section .el-card {
  height: 150px;
}

.features-section :deep(.el-card__header) {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer {
  text-align: center;
  padding: 40px 0;
  color: var(--color-muted);
  font-size: 14px;
}
</style>
