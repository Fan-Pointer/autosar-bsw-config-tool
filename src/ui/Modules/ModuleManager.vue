<template>
  <el-dialog
    :model-value="modelValue"
    title="模块管理"
    width="min(1000px, 94vw)"
    class="module-manager"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <section class="definition-import" aria-label="导入模块定义">
      <label
        >导入模块定义（ARXML）
        <input
          type="file"
          accept=".arxml"
          aria-label="导入模块定义（ARXML）"
          :disabled="definitionBusy"
          @change="readDefinitions"
        />
      </label>
      <p v-if="definitionBusy" role="status">{{ definitionStatus }}</p>
      <p v-if="definitionError" role="alert">{{ definitionError }}</p>
      <div v-if="fileModules.length" class="definition-choices">
        <label v-for="name in fileModules" :key="name">
          <input
            v-model="selectedDefinitions"
            type="checkbox"
            :value="name"
            :disabled="definitionBusy || store.modules.some((item) => item.shortName === name)"
            :aria-label="'导入 ' + name"
          />
          {{ name }}{{ store.modules.some((item) => item.shortName === name) ? '（已加载）' : '' }}
        </label>
      </div>
      <el-button
        v-if="fileModules.length"
        :disabled="definitionBusy || !selectedDefinitions.length"
        @click="previewDefinitions"
        >读取选中模块</el-button
      >
      <div v-if="pendingDefinitions.length" class="definition-preview">
        <p>待导入：{{ pendingDefinitions.map((item) => item.shortName).join('、') }}</p>
        <details v-if="definitionWarnings.length" open>
          <summary>定义导入限制（{{ definitionWarnings.length }}）</summary>
          <ul>
            <li v-for="warning in definitionWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </details>
        <el-button :disabled="definitionBusy" type="primary" @click="applyDefinitions"
          >导入选中模块</el-button
        >
      </div>
    </section>
    <div class="module-transfer">
      <section class="module-catalog">
        <header>
          <label
            ><input
              type="checkbox"
              :checked="allSelected"
              @change="selectAll(($event.target as HTMLInputElement).checked)"
            />
            全部</label
          ><span>{{ leftSelected.length }}/{{ available.length }}</span>
        </header>
        <div class="module-panel-body">
          <el-input
            v-model="leftSearch"
            placeholder="请输入模块名"
            aria-label="搜索可用模块"
            clearable
          />
          <details open>
            <summary>已加载 BSWMD</summary>
            <label v-for="item in filteredAvailable" :key="item.shortName" class="catalog-item">
              <input v-model="leftSelected" type="checkbox" :value="item.shortName" />
              {{ item.shortName }}
            </label>
          </details>
          <p v-if="!available.length" class="empty-catalog">全部已加载模块均已加入</p>
        </div>
      </section>
      <div class="transfer-actions">
        <button aria-label="加入模块" :disabled="!leftSelected.length" @click="include">›</button
        ><button aria-label="移除模块" :disabled="!rightSelected.length" @click="exclude">‹</button>
      </div>
      <section class="module-selection">
        <header>
          <span /> <span>{{ rightSelected.length }}/{{ included.length }}</span>
        </header>
        <div class="module-panel-body">
          <el-input
            v-model="rightSearch"
            placeholder="请输入模块名"
            aria-label="搜索已选模块"
            clearable
          />
          <table>
            <thead>
              <tr>
                <th>选择</th>
                <th>模块名</th>
                <th>生成</th>
                <th>验证</th>
                <th>定义路径</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredIncluded" :key="item.shortName">
                <td>
                  <input
                    v-model="rightSelected"
                    type="checkbox"
                    :value="item.shortName"
                    :aria-label="'选择模块 ' + item.shortName"
                  />
                </td>
                <td>{{ item.shortName }}</td>
                <td>
                  <input
                    v-model="draft[item.shortName].generation"
                    type="checkbox"
                    :aria-label="item.shortName + ' 生成'"
                  />
                </td>
                <td>
                  <input
                    v-model="draft[item.shortName].validation"
                    type="checkbox"
                    :aria-label="item.shortName + ' 验证'"
                  />
                </td>
                <td>Autosar/{{ item.shortName }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
    <template #footer
      ><el-button type="primary" :disabled="definitionBusy" @click="confirm"
        >确定</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useConfigStore, type ModulePreference } from '@/stores/configStore';
import type { BswmdModule } from '@/core/bswmd/BswmdTypes';
import { EcucDefinitionSession } from './EcucDefinitionSession';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; applied: [] }>();
const store = useConfigStore();
let definitionSession: EcucDefinitionSession | undefined;
const fileModules = ref<string[]>([]),
  selectedDefinitions = ref<string[]>([]);
const pendingDefinitions = ref<BswmdModule[]>([]);
const definitionBusy = ref(false),
  definitionStatus = ref(''),
  definitionError = ref('');
const definitionWarnings = computed(() =>
  pendingDefinitions.value.flatMap((item) => item.importWarnings ?? [])
);
watch(
  selectedDefinitions,
  () => {
    pendingDefinitions.value = [];
  },
  { deep: true }
);
watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      definitionSession?.dispose();
      definitionSession = undefined;
      fileModules.value = [];
      pendingDefinitions.value = [];
    }
  }
);
onBeforeUnmount(() => definitionSession?.dispose());
async function readDefinitions(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  definitionSession?.dispose();
  fileModules.value = [];
  selectedDefinitions.value = [];
  pendingDefinitions.value = [];
  definitionBusy.value = true;
  definitionError.value = '';
  definitionStatus.value = '正在读取文件并列出模块…';
  try {
    definitionSession = new EcucDefinitionSession();
    fileModules.value = await definitionSession.open(file);
    if (!fileModules.value.length) definitionError.value = '文件中没有 ECUC-MODULE-DEF 定义';
  } catch (error) {
    definitionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    definitionBusy.value = false;
    input.value = '';
  }
}
async function previewDefinitions(): Promise<void> {
  if (!definitionSession) return;
  definitionBusy.value = true;
  definitionError.value = '';
  definitionStatus.value = '正在解析所选模块…';
  try {
    pendingDefinitions.value = await definitionSession.parse([...selectedDefinitions.value]);
  } catch (error) {
    definitionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    definitionBusy.value = false;
  }
}
async function applyDefinitions(): Promise<void> {
  definitionBusy.value = true;
  definitionError.value = '';
  definitionStatus.value = '正在保存模块定义…';
  try {
    if (!(await store.importModuleDefinitions(pendingDefinitions.value)))
      throw new Error(store.error ?? '模块保存失败');
    for (const item of pendingDefinitions.value)
      draft.value[item.shortName] = { ...store.modulePreferences[item.shortName] };
    selectedDefinitions.value = [];
    pendingDefinitions.value = [];
    emit('applied');
  } catch (error) {
    definitionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    definitionBusy.value = false;
  }
}
const draft = ref<Record<string, ModulePreference>>({});
const leftSelected = ref<string[]>([]),
  rightSelected = ref<string[]>([]);
const leftSearch = ref(''),
  rightSearch = ref('');
watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
    draft.value = Object.fromEntries(
      store.modules.map((item) => [item.shortName, { ...store.modulePreferences[item.shortName] }])
    );
    leftSelected.value = [];
    rightSelected.value = [];
    leftSearch.value = '';
    rightSearch.value = '';
  },
  { immediate: true }
);
const available = computed(() =>
  store.modules.filter((item) => !draft.value[item.shortName]?.included)
);
const included = computed(() =>
  store.modules.filter((item) => draft.value[item.shortName]?.included)
);
const filteredAvailable = computed(() =>
  available.value.filter((item) =>
    item.shortName.toLowerCase().includes(leftSearch.value.toLowerCase())
  )
);
const filteredIncluded = computed(() =>
  included.value.filter((item) =>
    item.shortName.toLowerCase().includes(rightSearch.value.toLowerCase())
  )
);
const allSelected = computed(
  () =>
    available.value.length > 0 &&
    available.value.every((item) => leftSelected.value.includes(item.shortName))
);
function selectAll(value: boolean): void {
  leftSelected.value = value ? available.value.map((item) => item.shortName) : [];
}
function include(): void {
  for (const name of leftSelected.value) draft.value[name].included = true;
  leftSelected.value = [];
}
function exclude(): void {
  for (const name of rightSelected.value) draft.value[name].included = false;
  rightSelected.value = [];
}
async function confirm(): Promise<void> {
  try {
    store.assertWritable();
  } catch {
    return;
  }
  const previous = store.modulePreferences;
  store.modulePreferences = Object.fromEntries(
    Object.entries(draft.value).map(([name, value]) => [name, { ...value }])
  );
  if (!(await store.saveConfig().catch(() => false))) {
    store.modulePreferences = previous;
    return;
  }
  emit('applied');
  emit('update:modelValue', false);
}
</script>
<style scoped>
.definition-import {
  padding-bottom: 12px;
  font-size: 13px;
}
.definition-import input[type='file'] {
  margin-left: 12px;
  max-width: 340px;
}
.definition-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  max-height: 140px;
  overflow: auto;
  margin: 10px 0;
}
.definition-preview details {
  max-height: 150px;
  overflow: auto;
  margin-bottom: 8px;
}
.definition-import [role='alert'] {
  color: var(--color-error);
}
:global(.module-manager) {
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
}
:global(.module-manager .el-dialog__header) {
  padding: 10px 20px;
  margin: 0;
  text-align: center;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
}
:global(.module-manager .el-dialog__title) {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-muted);
}
:global(.module-manager .el-dialog__headerbtn) {
  top: 0;
  height: 40px;
}
:global(.module-manager .el-dialog__body) {
  padding: 20px 20px 0;
}
:global(.module-manager .el-dialog__footer) {
  padding: 10px 20px;
  border-top: 1px solid var(--color-border);
}
:global(.module-manager .el-dialog__footer .el-button) {
  width: 100px;
}
.module-transfer {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 72px minmax(420px, 1.65fr);
  height: 485px;
}
.module-catalog,
.module-selection {
  border: 1px solid var(--color-border);
  border-radius: 3px;
  box-shadow: 0 1px 8px var(--color-shadow);
  overflow: auto;
}
header {
  height: 52px;
  padding: 0 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-border);
}
.module-panel-body {
  padding: 20px;
}
.module-panel-body :deep(.el-input__wrapper) {
  min-height: 25px;
  height: 25px;
  border-radius: 2px;
}
.module-panel-body :deep(input) {
  height: 23px;
  font-size: 12px;
}
details {
  margin-top: 14px;
}
summary {
  cursor: pointer;
  color: var(--color-muted);
}
.catalog-item {
  display: block;
  margin: 12px 20px;
}
input[type='checkbox'] {
  accent-color: var(--color-accent);
  width: 14px;
  height: 14px;
  vertical-align: middle;
}
.transfer-actions {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
  justify-content: center;
}
.transfer-actions button {
  border: 1px solid var(--color-border);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  background: var(--color-surface);
  color: var(--color-muted);
  font-size: 23px;
  cursor: pointer;
}
.transfer-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
}
td,
th {
  height: 33px;
  border: 1px solid var(--color-border);
  text-align: center;
  padding: 4px 8px;
}
th {
  background: var(--color-panel);
  color: var(--color-muted);
  font-weight: 600;
}
.empty-catalog {
  color: var(--color-muted);
  font-size: 12px;
}
</style>
