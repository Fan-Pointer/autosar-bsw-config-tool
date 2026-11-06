<template>
  <div class="container-actions">
    <el-button
      :disabled="!store.childOptions.length || store.isLoading || store.isImporting"
      @click="openAdd"
      >添加</el-button
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
    <el-dialog
      v-model="showAdd"
      title="选择允许的子定义"
      width="640px"
      append-to-body
      @opened="focusSearch"
    >
      <p class="add-parent-line">父容器：{{ parentLabel }}</p>
      <el-input
        ref="searchInput"
        v-model="filter"
        class="add-search"
        placeholder="搜索名称或描述…"
        clearable
        aria-label="搜索子定义"
        @keydown.enter.prevent="addFirstAvailable"
      />
      <div class="child-option-list" role="list">
        <div
          v-for="option in visibleOptions"
          :key="option.definition.uuid"
          class="child-option"
          :class="{ 'required-pending': isPendingRequired(option) }"
          role="listitem"
        >
          <div class="child-option-main">
            <span class="child-option-name" :title="option.definition.shortName">{{
              option.definition.shortName
            }}</span>
            <span class="child-option-badge" title="定义多重性">{{ multLabel(option) }}</span>
            <span class="child-option-badge" title="当前已实例数 / 上限">{{
              countLabel(option)
            }}</span>
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="Boolean(option.disabledReason) || store.isLoading"
              :title="option.disabledReason"
              @click="add(option.definition.uuid)"
              >添加</el-button
            >
          </div>
          <div
            v-if="option.definition.description"
            class="child-option-desc"
            :title="option.definition.description"
          >
            {{ option.definition.description }}
          </div>
          <div v-if="option.disabledReason" class="child-option-reason">
            {{ option.disabledReason }}
          </div>
        </div>
        <el-empty v-if="!visibleOptions.length" description="没有匹配的子定义" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import type { ContainerAddOption } from '@/core/config/ConfigInstance';
import { useConfigStore } from '@/stores/configStore';

const emit = defineEmits<{ navigate: [violation: ConstraintViolation]; close: []; opening: [] }>();
const store = useConfigStore();
const showAdd = ref(false);
const filter = ref('');
const searchInput = ref<{ focus: () => void } | null>(null);
watch(
  () => [store.activeUuid, store.selectedEntry?.container.uuid],
  () => {
    showAdd.value = false;
  }
);
const firstError = computed(() =>
  store.violations.find(
    (item) =>
      item.severity === 'ERROR' && item.containerUuid === store.selectedEntry?.container.uuid
  )
);

/** 父容器现有子实例按 definitionRef 计数（根级时统计 config.containers）。 */
const existingCounts = computed(() => {
  const counts = new Map<string, number>();
  const siblings = store.selectedEntry?.container
    ? store.selectedEntry.container.subContainers
    : (store.config?.containers ?? []);
  for (const item of siblings)
    counts.set(item.definitionRef, (counts.get(item.definitionRef) ?? 0) + 1);
  return counts;
});

const parentLabel = computed(
  () => store.selectedEntry?.container.shortName ?? store.module?.shortName ?? ''
);

function multLabel(option: ContainerAddOption): string {
  const { lower, upper } = option.definition.multiplicity;
  return `mult ${lower}..${upper === 'unbounded' ? '∞' : upper}`;
}

function countLabel(option: ContainerAddOption): string {
  const count = existingCounts.value.get(option.definition.uuid) ?? 0;
  const upper = option.definition.multiplicity.upper;
  return `${count} / ${upper === 'unbounded' ? '∞' : upper}`;
}

/** 必选且尚未满足下限：列表置顶并标红。 */
function isPendingRequired(option: ContainerAddOption): boolean {
  const { lower } = option.definition.multiplicity;
  return lower > 0 && (existingCounts.value.get(option.definition.uuid) ?? 0) < lower;
}

const visibleOptions = computed(() => {
  const keyword = filter.value.trim().toLowerCase();
  const matched = store.childOptions.filter((option) => {
    if (!keyword) return true;
    return (
      option.definition.shortName.toLowerCase().includes(keyword) ||
      (option.definition.description ?? '').toLowerCase().includes(keyword)
    );
  });
  return [...matched].sort((left, right) => {
    const leftPending = isPendingRequired(left) ? 0 : 1;
    const rightPending = isPendingRequired(right) ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return left.definition.shortName.localeCompare(right.definition.shortName);
  });
});

function openAdd(): void {
  emit('opening');
  filter.value = '';
  showAdd.value = true;
}
function focusSearch(): void {
  void nextTick(() => searchInput.value?.focus());
}
function addFirstAvailable(): void {
  const first = visibleOptions.value.find((option) => !option.disabledReason);
  if (first) void add(first.definition.uuid);
}

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
  const configUuid = store.activeUuid;
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
  if (
    store.activeUuid !== configUuid ||
    !store.entries.some((entry) => entry.container.uuid === container.uuid)
  )
    return;
  await perform(() => store.removeContainerInstance(container.uuid));
}
function locate(): void {
  if (firstError.value) emit('navigate', firstError.value);
  emit('close');
}
defineExpose({ openAdd });
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
.add-parent-line {
  margin: 0 0 8px;
  color: var(--color-text);
}
.add-search {
  margin-bottom: 12px;
}
.child-option-list {
  max-height: 420px;
  overflow: auto;
}
.child-option {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}
.child-option.required-pending {
  border-color: var(--color-danger, #f56c6c);
  background: var(--color-danger-bg, rgba(245, 108, 108, 0.06));
}
.child-option-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.child-option-name {
  font-weight: 600;
}
.child-option-badge {
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  background: var(--color-fill, #f0f2f5);
  color: var(--color-text);
}
.child-option-desc {
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  color: var(--color-text-secondary, #909399);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.child-option-reason {
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-danger, #f56c6c);
}
</style>
