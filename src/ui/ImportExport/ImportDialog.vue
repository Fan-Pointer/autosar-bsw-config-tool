<template>
  <el-dialog
    :model-value="modelValue"
    :title="'导入 ' + format.toUpperCase()"
    width="min(960px, 94vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!store.isImporting"
    :show-close="!store.isImporting"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="import-options">
      <label
        >配置文件（上限 50 MB）<input
          aria-label="配置文件"
          type="file"
          :accept="format === 'json' ? '.json' : '.arxml,.xml'"
          :disabled="store.isImporting"
          @change="readFile"
      /></label>
      <label
        >导入到<select
          v-model="target"
          aria-label="导入目标"
          :disabled="store.isImporting"
          @change="prepare"
        >
          <option value="current" :disabled="!store.config">
            当前配置集：{{ store.config?.name ?? '未打开' }}
          </option>
          <option value="new">新建配置集</option>
        </select></label
      >
    </div>
    <p class="import-help">
      文件仅在本机处理。预览后点击“应用导入”才会保存。未在文件中出现的工程容器会保留。
    </p>
    <fieldset class="strategies" :disabled="store.isImporting">
      <legend>冲突解决策略</legend>
      <label><input v-model="strategy" type="radio" value="overwrite" />覆盖</label>
      <label><input v-model="strategy" type="radio" value="skip" />跳过</label>
      <label><input v-model="strategy" type="radio" value="rename" />重命名</label>
    </fieldset>
    <p class="import-help">{{ strategyHelp[strategy] }}</p>
    <p v-if="reading" role="status">正在读取文件…</p>
    <el-alert
      v-if="error || preview.error"
      :title="error || preview.error"
      type="error"
      :closable="false"
      show-icon
    />
    <template v-if="preview.plan">
      <div class="import-counts" aria-label="导入预览统计">
        <span
          >新增容器数 <strong>{{ preview.plan.addedContainers }}</strong></span
        >
        <span
          >新增参数数 <strong>{{ preview.plan.addedParameters }}</strong></span
        >
        <span
          >冲突数 <strong>{{ preview.plan.conflicts.length }}</strong></span
        >
        <span
          >将被删除项数 <strong>{{ preview.plan.deletedItems }}</strong></span
        >
      </div>
      <div class="conflict-scroll">
        <table class="conflict-table">
          <thead>
            <tr>
              <th>冲突实例路径</th>
              <th>参数名</th>
              <th>文件生成值 / 文件引用值</th>
              <th>工程配置值 / 工程引用值</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in preview.plan.conflicts" :key="index">
              <td>{{ row.path }}</td>
              <td>{{ row.parameter }}</td>
              <td>{{ row.fileValue }}</td>
              <td>{{ row.projectValue }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!preview.plan.conflicts.length" class="import-help">没有冲突，可以应用导入。</p>
    </template>
    <template #footer
      ><el-button :disabled="store.isImporting" @click="emit('update:modelValue', false)"
        >取消</el-button
      ><el-button
        type="primary"
        :disabled="!preview.plan || reading || Boolean(error)"
        :loading="store.isImporting"
        @click="apply"
        >应用导入</el-button
      ></template
    >
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import { checkImportSize } from '@/core/io/ConfigJson';
import type { ConflictStrategy, ImportFormat, ImportPlan, ImportSession } from '@/core/io/IoTypes';

const props = defineProps<{ modelValue: boolean; format: ImportFormat }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; imported: [] }>();
const store = useConfigStore();
const strategy = ref<ConflictStrategy>('overwrite');
const target = ref<'current' | 'new'>(store.config ? 'current' : 'new');
const session = shallowRef<ImportSession>();
const error = ref(''),
  reading = ref(false);
let content = '',
  readVersion = 0;
const strategyHelp = {
  overwrite: '覆盖同路径实例的参数和引用；文件缺少的字段将删除。子容器按路径合并。',
  skip: '保留有冲突的实例及其子树，仍导入其他新增实例。',
  rename: '有冲突的实例以 _2、_3 等后缀并入，保留原实例；仍须满足实例数量上限。',
};
const preview = computed<{ plan?: ImportPlan; error: string }>(() => {
  if (!session.value) return { error: '' };
  try {
    return { plan: store.previewImport(session.value, strategy.value), error: '' };
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : String(reason) };
  }
});
watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      readVersion++;
      return;
    }
    content = '';
    session.value = undefined;
    error.value = '';
    reading.value = false;
    strategy.value = 'overwrite';
    target.value = store.config ? 'current' : 'new';
  }
);
function prepare(): void {
  session.value = undefined;
  error.value = '';
  if (!content) return;
  try {
    session.value = store.prepareImport(content, props.format, target.value);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}
async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const version = ++readVersion;
  content = '';
  session.value = undefined;
  error.value = '';
  reading.value = true;
  try {
    checkImportSize(file.size);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('无法读取文本文件'));
      reader.onerror = () => reject(new Error('文件读取失败，请重新选择'));
      reader.readAsText(file, 'UTF-8');
    });
    if (version !== readVersion) return;
    content = text;
    if (!content.trim()) throw new Error('文件为空');
    prepare();
  } catch (reason) {
    if (version === readVersion)
      error.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    if (version === readVersion) {
      reading.value = false;
      input.value = '';
    }
  }
}
async function apply(): Promise<void> {
  if (!session.value || !preview.value.plan) return;
  if (await store.applyImport(session.value, strategy.value)) {
    ElMessage.success('导入完成，已保存到本机');
    emit('imported');
    emit('update:modelValue', false);
  } else error.value = store.error ?? '导入失败，工程未改变';
}
</script>

<style scoped>
.import-options {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.import-options label {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.import-options select {
  min-height: 32px;
  max-width: 350px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.import-help {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}
.strategies {
  display: flex;
  gap: 28px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
}
.strategies label {
  cursor: pointer;
}
.import-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin: 20px 0;
}
.import-counts span {
  background: var(--color-panel);
  padding: 14px;
  border-radius: 4px;
}
.import-counts strong {
  display: block;
  font-size: 24px;
  color: var(--color-accent);
  margin-top: 8px;
}
.conflict-scroll {
  max-height: 320px;
  overflow: auto;
}
.conflict-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
  table-layout: fixed;
}
.conflict-table th,
.conflict-table td {
  border: 1px solid var(--color-border);
  padding: 10px;
  text-align: left;
  overflow-wrap: anywhere;
}
.conflict-table th {
  position: sticky;
  top: 0;
  background: var(--color-panel);
}
</style>
