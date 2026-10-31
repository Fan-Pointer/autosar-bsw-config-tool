<template>
  <div class="validation-panel">
    <div class="panel-header">
      <span class="title">验证结果</span>
      <el-badge :value="errorCount" :hidden="errorCount === 0" type="danger">
        <el-badge :value="warningCount" :hidden="warningCount === 0" type="warning">
          <el-button size="small" @click="runValidation">
            <el-icon><Refresh /></el-icon>
            验证
          </el-button>
        </el-badge>
      </el-badge>
    </div>

    <div class="panel-content">
      <!-- 无错误 -->
      <div v-if="violations.length === 0 && !isValidating" class="empty-state">
        <el-icon :size="40" color="#67c23a"><SuccessFilled /></el-icon>
        <p>{{ validated ? '验证通过' : '尚未验证' }}</p>
      </div>

      <!-- 验证中 -->
      <div v-else-if="isValidating" class="loading-state">
        <el-icon class="is-loading" :size="30"><Loading /></el-icon>
        <p>验证中...</p>
      </div>

      <!-- 验证结果列表 -->
      <div v-else class="violations-list">
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
            <span class="rule-id">{{ violation.ruleId }}</span>
          </div>
          <div class="violation-message">{{ violation.message }}</div>
          <div v-if="violation.suggestion" class="violation-suggestion">
            建议: {{ violation.suggestion }}
          </div>
          <div v-if="violation.path" class="violation-path">
            {{ violation.path }}
          </div>
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
}

const props = withDefaults(defineProps<Props>(), {
  violations: () => [],
  isValidating: false,
  validated: false,
});

const emit = defineEmits<{
  validate: [];
  navigate: [violation: ConstraintViolation];
}>();

const errorCount = computed(() => props.violations.filter((v) => v.severity === 'ERROR').length);
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
  background: #fff;
}

.panel-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid #e4e7ed;
}

.title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #909399;
}

.empty-state p {
  margin-top: 12px;
  font-size: 14px;
}

.violations-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.violation-item {
  padding: 12px;
  border-radius: 4px;
  border-left: 3px solid #e4e7ed;
  cursor: pointer;
  transition: background-color 0.2s;
}

.violation-item:hover {
  background-color: #f5f7fa;
}

.violation-item.severity-error {
  border-left-color: #f56c6c;
  background-color: #fef0f0;
}

.violation-item.severity-warning {
  border-left-color: #e6a23c;
  background-color: #fdf6ec;
}

.violation-item.severity-info {
  border-left-color: #409eff;
  background-color: #ecf5ff;
}

.violation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.rule-id {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}

.violation-message {
  font-size: 13px;
  color: #303133;
  margin-bottom: 4px;
}

.violation-suggestion {
  font-size: 12px;
  color: #67c23a;
  margin-bottom: 4px;
}

.violation-path {
  font-size: 11px;
  color: #909399;
  font-family: monospace;
}
</style>
