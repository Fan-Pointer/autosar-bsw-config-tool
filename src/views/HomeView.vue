<template>
  <div class="home-container">
    <div class="hero-section">
      <h1 class="title">AUTOSAR BSW Config Tool</h1>
      <p class="subtitle">基于网页的 AUTOSAR 基础软件配置工具</p>

      <div class="actions">
        <el-select v-model="selectedModule" aria-label="配置模块" style="width: 180px" size="large">
          <el-option
            v-for="module in store.modules"
            :key="module.shortName"
            :label="module.shortName"
            :value="module.shortName"
          />
        </el-select>
        <el-button type="primary" size="large" @click="createNewConfig">
          <el-icon><Plus /></el-icon>
          新建配置
        </el-button>
        <el-button size="large" @click="openExistingConfig">
          <el-icon><FolderOpened /></el-icon>
          打开配置
        </el-button>
      </div>
    </div>

    <div class="recent-section" v-if="recentConfigs.length > 0">
      <h2>最近打开</h2>
      <el-table :data="recentConfigs" style="width: 100%">
        <el-table-column prop="name" label="配置名称" />
        <el-table-column prop="module" label="模块" />
        <el-table-column prop="lastModified" label="修改时间">
          <template #default="{ row }">
            {{ formatDate(row.lastModified) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default>
            <el-button link type="primary" @click="openExistingConfig">打开</el-button>
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';

const router = useRouter();
const store = useConfigStore();
const selectedModule = ref(store.modules[0]?.shortName);

// TODO: 从 localStorage 加载最近配置
const recentConfigs = ref<
  Array<{
    id: string;
    name: string;
    module: string;
    lastModified: number;
  }>
>([]);

const createNewConfig = () => {
  store.createConfig(selectedModule.value);
  router.push('/workspace');
};

const openExistingConfig = async () => {
  if (await store.loadConfig()) router.push('/workspace');
  else ElMessage.info(store.error ?? '本机还没有保存的配置');
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN');
};
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
  color: #303133;
  margin-bottom: 16px;
}

.subtitle {
  font-size: 20px;
  color: #606266;
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
  color: #303133;
}

.features-section {
  margin: 60px 0;
}

.features-section h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: #303133;
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
  color: #909399;
  font-size: 14px;
}
</style>
