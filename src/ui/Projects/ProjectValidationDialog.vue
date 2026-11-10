<template>
  <el-dialog
    v-if="modelValue"
    :model-value="true"
    title="验证所有工程"
    width="min(760px, 94vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p v-if="!result.length" class="empty">当前没有可验证的工程或配置集。</p>
    <table v-else class="result-table" aria-label="验证结果">
      <thead>
        <tr>
          <th>工程</th>
          <th>配置集</th>
          <th>就绪</th>
          <th>错误</th>
          <th>警告</th>
          <th>失败原因（前两项）</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in result" :key="item.name">
          <td>{{ item.name }}</td>
          <td>{{ item.total }}</td>
          <td>{{ item.ready }}</td>
          <td :class="{ bad: item.errorCount }">{{ item.errorCount }}</td>
          <td>{{ item.warningCount }}</td>
          <td class="reason">
            <template v-if="item.failures.length">
              <div v-for="failure in item.failures.slice(0, 2)" :key="failure.set">
                <strong>{{ failure.set }}</strong>：{{ failure.reason }}
              </div>
              <div v-if="item.failures.length > 2" class="more">
                另有 {{ item.failures.length - 2 }} 个未显示
              </div>
            </template>
            <span v-else class="ok">全部通过 ✓</span>
          </td>
        </tr>
      </tbody>
    </table>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
interface ValidationRow {
  name: string;
  total: number;
  ready: number;
  errorCount: number;
  warningCount: number;
  failures: { set: string; reason: string }[];
}
defineProps<{ modelValue: boolean; result: ValidationRow[] }>();
const emit = defineEmits<{ 'update:modelValue': [visible: boolean] }>();
</script>

<style scoped>
.empty {
  margin: 8px 0;
  color: var(--color-muted);
  font-size: 13px;
}
.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.result-table th,
.result-table td {
  border-bottom: 1px solid var(--color-border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.result-table th {
  color: var(--color-muted);
  font-weight: 600;
  white-space: nowrap;
}
.result-table td.bad {
  color: var(--color-error);
  font-weight: 700;
}
.reason {
  max-width: 320px;
  line-height: 1.5;
}
.more {
  color: var(--color-muted);
}
.ok {
  color: var(--color-success);
}
</style>
