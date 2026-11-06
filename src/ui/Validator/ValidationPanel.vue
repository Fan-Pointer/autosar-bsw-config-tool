<template>
  <div class="validation-panel">
    <div class="panel-header">
      <span class="title"
        >问题（{{ violations.length + (operationError ? 1 : 0) }}） · 错误 {{ errorCount }} / 警告
        {{ warningCount }}</span
      >
      <el-badge :value="errorCount" :hidden="errorCount === 0" type="danger">
        <el-badge :value="warningCount" :hidden="warningCount === 0" type="warning">
          <el-button size="small" @click="runValidation">
            <el-icon><Refresh /></el-icon>
            验证
          </el-button>
        </el-badge>
      </el-badge>
      <button aria-label="关闭验证结果" class="collapse-button" @click="emit('collapse')">
        收起
      </button>
    </div>

    <div class="panel-content">
      <el-alert v-if="operationError" :title="operationError" type="error" :closable="false" />
      <!-- 无错误 -->
      <div v-if="violations.length === 0 && !isValidating && !operationError" class="empty-state">
        <el-icon :size="40" color="var(--color-success)"><SuccessFilled /></el-icon>
        <p>{{ validated ? '验证通过' : '尚未验证' }}</p>
      </div>

      <!-- 验证中 -->
      <div v-else-if="isValidating" class="loading-state">
        <el-icon class="is-loading" :size="30"><Loading /></el-icon>
        <p>验证中...</p>
      </div>

      <!-- 验证结果列表 -->
      <div v-else-if="violations.length" class="violations-list">
        <div class="issue-columns" aria-hidden="true">
          <span>严重度</span><span>路径</span><span>原因 / 建议</span><span>操作</span>
        </div>
        <div
          v-for="(violation, index) in violations"
          :key="`${violation.ruleId}-${violation.containerUuid}-${index}`"
          class="violation-item"
          :class="`severity-${violation.severity.toLowerCase()}`"
          @click="onViolationClick(violation)"
          role="button"
          tabindex="0"
          @keydown.enter="onViolationClick(violation)"
          @keydown.space.prevent="onViolationClick(violation)"
        >
          <div class="violation-header">
            <el-tag :type="getSeverityType(violation.severity)" size="small">
              {{ violation.severity }}
            </el-tag>
          </div>
          <div v-if="violation.path" class="violation-path">
            {{ violation.path }}
          </div>
          <div>
            <div class="violation-message">{{ violation.message }}</div>
            <small class="rule-id">{{ violation.ruleId }}</small>
            <div v-if="violation.suggestion" class="violation-suggestion">
              建议: {{ violation.suggestion }}
            </div>
          </div>
          <button
            class="locate-button"
            :aria-label="'定位 ' + violation.path"
            @click.stop="onViolationClick(violation)"
          >
            定位
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Refresh, SuccessFilled, Loading } from '@element-plus/icons-vue';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';

interface Props {
  violations?: ConstraintViolation[];
  isValidating?: boolean;
  validated?: boolean;
  operationError?: string;
}

const props = withDefaults(defineProps<Props>(), {
  violations: () => [],
  isValidating: false,
  validated: false,
  operationError: '',
});

const emit = defineEmits<{
  validate: [];
  navigate: [violation: ConstraintViolation];
  collapse: [];
}>();

const errorCount = computed(
  () => props.violations.filter((v) => v.severity === 'ERROR').length + (props.operationError ? 1 : 0)
);
const warningCount = computed(
  () => props.violations.filter((v) => v.severity === 'WARNING').length
);

/**
 * 执行验证
 * @returns Nothing; requests validation from the owning workspace.
 */
function runValidation(): void {
  emit('validate');
}

/**
 * 获取严重程度对应的 Tag 类型
 */
function getSeverityType(severity: string): 'danger' | 'warning' | 'info' {
  switch (severity) {
    case 'ERROR':
      return 'danger';
    case 'WARNING':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * 点击违规项
 */
function onViolationClick(violation: ConstraintViolation): void {
  emit('navigate', violation);
}

defineExpose({ runValidation });
</script>

<style scoped>
.validation-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.panel-header {
  min-height: 40px;
  flex-shrink: 0;
  gap: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
}

.title {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
}

.panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 16px;
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: var(--color-muted);
}

.empty-state p {
  margin-top: 12px;
  font-size: 14px;
}

.violations-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.violation-item {
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid var(--color-border);
  cursor: pointer;
  transition: background-color 0.2s;
}
.violation-item,
.issue-columns {
  display: grid;
  grid-template-columns: 90px minmax(180px, 1fr) minmax(240px, 2fr) 56px;
  align-items: start;
  gap: 12px;
  overflow-wrap: anywhere;
}
.issue-columns {
  padding: 4px 8px;
  font-size: 12px;
  color: var(--color-muted);
}
.collapse-button,
.locate-button {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  color: var(--color-accent);
  cursor: pointer;
  padding: 4px 8px;
}
.collapse-button {
  margin-left: auto;
}

.violation-item:hover {
  background-color: var(--color-panel);
}

.violation-item.severity-error {
  border-left-color: var(--color-error);
  background-color: var(--color-error-bg);
}

.violation-item.severity-warning {
  border-left-color: var(--color-warning);
  background-color: var(--color-warning-bg);
}

.violation-item.severity-info {
  border-left-color: var(--color-accent);
  background-color: var(--color-selected);
}

.violation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.rule-id {
  font-size: 12px;
  color: var(--color-muted);
  font-family: monospace;
}

.violation-message {
  font-size: 13px;
  color: var(--color-text);
  margin-bottom: 4px;
}

.violation-suggestion {
  font-size: 12px;
  color: var(--color-success);
  margin-bottom: 4px;
}

.violation-path {
  font-size: 11px;
  color: var(--color-muted);
  font-family: monospace;
}
</style>
