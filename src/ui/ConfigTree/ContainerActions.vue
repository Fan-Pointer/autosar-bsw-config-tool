<template>
  <div
    class="container-actions"
    :class="{ 'context-menu': context }"
    :role="context ? 'menu' : undefined"
  >
    <el-button :disabled="!store.childOptions.length || store.isLoading" @click="showAdd = true"
      >新增子项</el-button
    >
    <span :title="store.cloneReason">
      <el-button :disabled="Boolean(store.cloneReason) || store.isLoading" @click="clone"
        >克隆实例</el-button
      >
    </span>
    <span :title="store.removalReason">
      <el-button
        type="danger"
        plain
        :disabled="Boolean(store.removalReason) || store.isLoading"
        @click="remove"
        >删除实例</el-button
      >
    </span>
    <el-button :disabled="!firstError" @click="locate">定位错误</el-button>
    <small v-if="store.removalReason && store.selectedEntry" class="limit-reason">{{
      store.removalReason
    }}</small>
    <el-button v-if="context" link @click="emit('close')">关闭菜单</el-button>
    <el-dialog v-model="showAdd" title="选择允许的子定义" width="560px" append-to-body>
      <p>父容器：{{ store.selectedEntry?.container.shortName ?? store.module?.shortName }}</p>
      <div v-for="option in store.childOptions" :key="option.definition.uuid" class="child-option">
        <el-button
          :disabled="Boolean(option.disabledReason) || store.isLoading"
          :title="option.disabledReason"
          @click="add(option.definition.uuid)"
          >{{ option.definition.shortName }}</el-button
        >
        <span>{{ option.definition.description }}</span>
        <small v-if="option.disabledReason">{{ option.disabledReason }}</small>
      </div>
      <el-empty v-if="!store.childOptions.length" description="该容器没有子定义" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import { useConfigStore } from '@/stores/configStore';

defineProps<{ context?: boolean }>();
const emit = defineEmits<{ navigate: [violation: ConstraintViolation]; close: [] }>();
const store = useConfigStore();
const showAdd = ref(false);
const firstError = computed(() =>
  store.violations.find(
    (item) =>
      item.severity === 'ERROR' && item.containerUuid === store.selectedEntry?.container.uuid
  )
);

async function perform(action: () => unknown): Promise<void> {
  try {
    action();
    await store.saveConfig();
    showAdd.value = false;
    emit('close');
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
async function add(uuid: string): Promise<void> {
  await perform(() => store.addContainerInstance(uuid));
}
async function clone(): Promise<void> {
  await perform(() => store.cloneContainerInstance());
}
async function remove(): Promise<void> {
  const container = store.selectedEntry?.container;
  if (!container) return;
  try {
    await ElMessageBox.confirm(`删除实例「${container.shortName}」及其子项？`, '删除实例', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  await perform(() => store.removeContainerInstance(container.uuid));
}
function locate(): void {
  if (firstError.value) emit('navigate', firstError.value);
  emit('close');
}
</script>

<style scoped>
.container-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px;
}
.container-actions .el-button {
  margin-left: 0;
}
.limit-reason {
  width: 100%;
  color: var(--color-text);
}
.child-option {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.child-option small {
  width: 100%;
  color: var(--color-warning);
}
.context-menu {
  width: 300px;
  padding: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 14px var(--color-shadow);
  border-radius: 6px;
}
</style>
