<template>
  <section class="batch-panel" aria-label="批量修改">
    <h3>批量修改 · 已选 {{ store.selectedEntries.length }} 项</h3>
    <p>仅列出所选实例共有的参数；禁用、只读或类型不符的项会跳过。</p>
    <label
      >共有参数
      <select v-model="field" aria-label="批量参数">
        <option
          v-for="parameter in store.batchParameters"
          :key="parameter.uuid"
          :value="parameter.uuid"
        >
          {{ parameter.shortName }}
        </option>
      </select>
    </label>
    <template v-if="definition">
      <label
        >新值
        <select v-if="definition.type === 'BOOLEAN'" v-model="value" aria-label="批量值">
          <option :value="true">true</option>
          <option :value="false">false</option>
        </select>
        <select v-else-if="definition.type === 'ENUM'" v-model="value" aria-label="批量值">
          <option v-for="choice in definition.enumValues" :key="choice">{{ choice }}</option>
        </select>
        <input
          v-else-if="definition.type === 'INTEGER' || definition.type === 'FLOAT'"
          v-model.number="value"
          type="number"
          aria-label="批量值"
          :min="definition.min"
          :max="definition.max"
          :step="definition.type === 'INTEGER' ? 1 : 'any'"
        />
        <input v-else v-model="value" aria-label="批量值" />
      </label>
      <el-button :disabled="store.isImporting" @click="apply">应用批量修改</el-button>
    </template>
    <p v-else>所选实例没有共有参数。</p>
    <div v-if="result" role="status">
      成功 {{ result.success }} 项，跳过 {{ result.skipped.length }} 项
      <ul v-if="result.skipped.length">
        <li v-for="reason in result.skipped" :key="reason">{{ reason }}</li>
      </ul>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfigStore } from '@/stores/configStore';
const store = useConfigStore();
const field = ref('');
const value = ref<string | number | boolean>('');
const result = ref<{ success: number; skipped: string[] }>();
const definition = computed(() => store.batchParameters.find((p) => p.uuid === field.value));
watch(
  () => store.batchParameters,
  (parameters) => {
    if (!parameters.some((p) => p.uuid === field.value)) field.value = parameters[0]?.uuid ?? '';
    result.value = undefined;
  },
  { immediate: true }
);
watch(
  definition,
  (p) => {
    value.value =
      p?.type === 'BOOLEAN'
        ? false
        : p?.type === 'INTEGER' || p?.type === 'FLOAT'
          ? (p.min ?? 0)
          : (p?.enumValues?.[0] ?? '');
  },
  { immediate: true }
);
function apply(): void {
  result.value = store.batchSetParameter(field.value, value.value);
}
</script>
<style scoped>
.batch-panel {
  padding: 20px;
  color: var(--color-text);
}
h3 {
  font-size: 16px;
}
p {
  color: var(--color-muted);
}
label {
  display: block;
  margin: 16px 0;
}
input,
select {
  margin-left: 12px;
  padding: 6px;
  width: 240px;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
[role='status'] {
  margin-top: 18px;
}
</style>
