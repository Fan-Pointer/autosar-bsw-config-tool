<template>
  <div class="reference-panel" aria-label="参考数据">
    <p class="reference-note" role="status">
      解析展示将在后续版本提供；当前版本仅存档、识别与下载原文件。
    </p>
    <input
      ref="fileInput"
      class="reference-file-input"
      type="file"
      accept=".dbc,.ldf,.cdd"
      multiple
      aria-label="选择参考数据文件"
      @change="importFiles(($event.target as HTMLInputElement).files)"
    />
    <p v-if="store.lastError" class="reference-error" role="alert">{{ store.lastError }}</p>
    <table v-if="store.files.length" class="reference-table">
      <thead>
        <tr>
          <th>文件名</th>
          <th>类型</th>
          <th>大小</th>
          <th>导入时间</th>
          <th aria-label="操作" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="file in store.files" :key="file.id">
          <td>{{ file.name }}</td>
          <td>{{ file.kind }}</td>
          <td>{{ (file.sizeBytes / 1024).toFixed(1) }} KB</td>
          <td>{{ new Date(file.importedAt).toLocaleString() }}</td>
          <td class="row-actions">
            <button type="button" :aria-label="'下载 ' + file.name" @click="store.download(file.id)">
              下载
            </button>
            <button
              type="button"
              class="danger"
              :aria-label="'删除 ' + file.name"
              @click="removeFile(file.id)"
            >
              删除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="reference-empty" role="status">尚未导入参考数据文件</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useReferenceDataStore } from '@/stores/referenceDataStore';
const store = useReferenceDataStore();
const fileInput = ref<HTMLInputElement>();
onMounted(() => void store.initialize());
async function importFiles(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  for (const file of Array.from(files)) {
    try {
      await store.importFile(file);
    } catch (reason) {
      store.lastError = reason instanceof Error ? reason.message : String(reason);
    }
  }
  if (fileInput.value) fileInput.value.value = '';
}
async function removeFile(id: string): Promise<void> {
  await store.remove(id);
}
</script>

<style scoped>
.reference-panel {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--color-text);
}
.reference-note {
  color: var(--color-muted);
  margin: 0 0 10px;
}
.reference-file-input {
  margin-bottom: 10px;
  color: var(--color-text);
}
.reference-error {
  color: var(--color-error);
  margin: 0 0 8px;
}
.reference-table {
  width: 100%;
  border-collapse: collapse;
}
.reference-table th,
.reference-table td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
  overflow-wrap: anywhere;
}
.row-actions button {
  border: 1px solid var(--color-border);
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  padding: 2px 8px;
  margin-right: 6px;
  cursor: pointer;
}
.row-actions button.danger {
  color: var(--color-error);
  border-color: var(--color-error);
}
.reference-empty {
  color: var(--color-muted);
}
</style>
