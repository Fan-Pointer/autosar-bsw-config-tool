<template>
  <section class="required-defaults" aria-label="必填建议值">
    <el-button
      :disabled="!store.config || store.isLoading || store.isImporting"
      title="确认当前配置集中尚未配置的必填参数，仅采用定义中的 DEFAULT-VALUE，保留已填写值"
      @click="confirm"
      >一键确认建议值</el-button
    >
    <span v-if="result" role="status">{{ result }}</span>
    <small v-else>仅确认当前配置集的必填默认值，可一次撤销</small>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';

const store = useConfigStore();
const result = ref('');
watch(
  () => store.activeUuid,
  () => {
    result.value = '';
  }
);
function confirm(): void {
  try {
    const counts = store.confirmRequiredDefaults();
    result.value = `本次已确认 ${counts.confirmed} 项；剩余 ${counts.remaining} 个必填参数需手工填写（无默认值或只读）。引用目标需另行选择。`;
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
</script>

<style scoped>
.required-defaults {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
}
.required-defaults span,
.required-defaults small {
  color: var(--color-muted);
}
</style>
