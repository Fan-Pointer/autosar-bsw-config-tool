<template>
  <div class="workspace-container">
    <!-- Header -->
    <header class="workspace-header">
      <div class="header-left">
        <el-button link @click="goHome">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <span class="config-name">{{ configName || '未命名配置' }}</span>
        <el-tag v-if="isDirty" type="warning">未保存</el-tag>
      </div>
      <div class="header-right">
        <el-button @click="saveConfig">
          <el-icon><Check /></el-icon>
          保存
        </el-button>
        <el-button type="primary" @click="exportConfig">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="workspace-main">
      <!-- Left: Config Tree -->
      <aside class="workspace-sidebar">
        <div class="sidebar-header">
          <span class="title">配置导航</span>
          <el-button link size="small" @click="addConfigSet">
            <el-icon><Plus /></el-icon>
          </el-button>
        </div>
        <!-- TODO: Config Tree Component -->
        <div class="tree-placeholder">
          <p>配置树组件 (待实现)</p>
        </div>
      </aside>

      <!-- Center: Detail Form -->
      <section class="workspace-content">
        <div class="content-placeholder">
          <el-empty description="选择一个配置项开始编辑">
            <template #image>
              <el-icon :size="60"><Setting /></el-icon>
            </template>
          </el-empty>
        </div>
        <!-- TODO: Dynamic Form Component -->
      </section>

      <!-- Right: Help Panel -->
      <aside class="workspace-help">
        <div class="help-header">
          <span class="title">属性帮助</span>
        </div>
        <div class="help-content">
          <p class="placeholder-text">点击表单字段查看 AUTOSAR 规范说明</p>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const configName = ref('TestConfig');
const isDirty = ref(false);

const goHome = () => {
  router.push('/');
};

const saveConfig = () => {
  // TODO: 实现保存逻辑
  isDirty.value = false;
};

const exportConfig = () => {
  // TODO: 实现导出逻辑
};

const addConfigSet = () => {
  // TODO: 实现添加配置集
};
</script>

<style scoped>
.workspace-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.workspace-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.config-name {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.header-right {
  display: flex;
  gap: 8px;
}

.workspace-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.workspace-sidebar {
  width: 280px;
  background: #f5f7fa;
  border-right: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.sidebar-header .title {
  font-weight: 500;
  color: #303133;
}

.tree-placeholder {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.workspace-content {
  flex: 1;
  background: #fff;
  overflow-y: auto;
}

.content-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-help {
  width: 320px;
  background: #f5f7fa;
  border-left: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
}

.help-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.help-header .title {
  font-weight: 500;
  color: #303133;
}

.help-content {
  flex: 1;
  padding: 16px;
}

.placeholder-text {
  color: #909399;
  font-size: 14px;
  line-height: 1.6;
}
</style>
