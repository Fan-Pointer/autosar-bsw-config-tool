<template>
  <div class="config-sets">
    <div class="set-actions">
      <el-select
        :model-value="store.activeUuid"
        aria-label="当前配置集"
        placeholder="选择配置集"
        :disabled="store.isLoading"
        @update:model-value="openSet"
      >
        <el-option
          v-for="set in store.summaries"
          :key="set.uuid"
          :value="set.uuid"
          :label="`${set.name} · ${set.module}`"
        />
      </el-select>
      <el-button type="primary" :disabled="store.isLoading" @click="showCreate = true"
        >新建配置集</el-button
      >
      <el-button
        :disabled="!store.config || store.isLoading || store.dataSafety.locked"
        @click="cloneSet"
        >克隆配置集</el-button
      >
      <el-button
        type="danger"
        plain
        :disabled="!store.config || store.isLoading || store.dataSafety.locked"
        @click="deleteSet"
        >删除配置集</el-button
      >
    </div>
    <p v-if="summary" class="set-metadata">
      <strong v-if="store.activeUuid && store.draftUuids.includes(store.activeUuid)"
        >独立草稿 ·
      </strong>
      最后修改：{{ new Date(summary.lastModified).toLocaleString('zh-CN') }} ·
      {{ summary.containerCount }} 个容器 · {{ summary.errorCount }} 个错误
    </p>
    <p v-else class="set-metadata">本机暂无配置集，点击「新建配置集」开始。</p>
    <el-dialog v-model="showCreate" title="新建配置集" width="460px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="createSet">
        <el-form-item label="模块">
          <el-select v-model="moduleName" aria-label="配置模块">
            <el-option
              v-for="module in store.modules"
              :key="moduleKey(module.shortName, module.version)"
              :label="`${module.shortName} · CP ${module.version}`"
              :value="moduleKey(module.shortName, module.version)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="配置集名称" required>
          <el-input v-model="name" aria-label="配置集名称" placeholder="例如：基础配置" />
        </el-form-item>
        <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
        <el-button
          native-type="submit"
          type="primary"
          :disabled="!name.trim() || !moduleName || store.isLoading"
          >创建并打开</el-button
        >
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import { moduleKey } from '@/core/bswmd/ModuleKey';

const store = useConfigStore();
const emit = defineEmits<{ opened: [] }>();
const showCreate = ref(false);
const name = ref('');
const initialModule = store.module ?? store.modules[0];
const moduleName = ref(
  initialModule ? moduleKey(initialModule.shortName, initialModule.version) : ''
);
const summary = computed(() => store.summaries.find((set) => set.uuid === store.activeUuid));

async function createSet(): Promise<void> {
  const definition = store.modules.find(
    (item) => moduleKey(item.shortName, item.version) === moduleName.value
  );
  if (!definition) return;
  if (
    await store
      .createConfigSet(name.value, definition.shortName, definition.version)
      .catch(() => false)
  ) {
    showCreate.value = false;
    name.value = '';
    emit('opened');
  }
}
async function openSet(uuid: string): Promise<void> {
  if (await store.switchConfigSet(uuid).catch(() => false)) emit('opened');
}
async function cloneSet(): Promise<void> {
  if (store.activeUuid && (await store.cloneConfigSet(store.activeUuid).catch(() => false)))
    emit('opened');
}
async function deleteSet(): Promise<void> {
  const uuid = store.activeUuid;
  if (!uuid) return;
  try {
    await ElMessageBox.confirm(
      `删除配置集「${summary.value?.name}」及其中全部实例？`,
      '删除配置集',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
  } catch {
    return;
  }
  await store.deleteConfigSet(uuid).catch(() => false);
}
</script>

<style scoped>
.config-sets {
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.set-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.set-actions .el-select {
  width: 260px;
}
.set-actions .el-button {
  margin-left: 0;
}
.set-metadata {
  margin: 10px 0 0;
  color: var(--color-text);
  font-size: 13px;
}
</style>
