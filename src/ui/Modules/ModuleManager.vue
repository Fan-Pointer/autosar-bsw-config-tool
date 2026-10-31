<template>
  <el-dialog
    :model-value="modelValue"
    title="模块管理"
    width="min(1000px, 94vw)"
    class="module-manager"
    @update:model-value="emit('update:modelValue', $event)"
  >
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
    <template #footer><el-button type="primary" @click="confirm">确定</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfigStore, type ModulePreference } from '@/stores/configStore';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; applied: [] }>();
const store = useConfigStore();
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
  const previous = store.modulePreferences;
  store.modulePreferences = Object.fromEntries(
    Object.entries(draft.value).map(([name, value]) => [name, { ...value }])
  );
  if (!(await store.saveConfig())) {
    store.modulePreferences = previous;
    return;
  }
  emit('applied');
  emit('update:modelValue', false);
}
</script>
<style scoped>
:global(.module-manager) {
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
}
:global(.module-manager .el-dialog__header) {
  padding: 10px 20px;
  margin: 0;
  text-align: center;
  border-bottom: 1px solid #d6dce3;
  background: #f6f6f6;
}
:global(.module-manager .el-dialog__title) {
  font-size: 15px;
  font-weight: 600;
  color: #596675;
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
  border-top: 1px solid #e4e7ed;
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
  border: 1px solid #dfe5ed;
  border-radius: 3px;
  box-shadow: 0 1px 8px #162c4810;
  overflow: auto;
}
header {
  height: 52px;
  padding: 0 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f5f7fa;
  border-bottom: 1px solid #dfe5ed;
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
  color: #69717a;
}
.catalog-item {
  display: block;
  margin: 12px 20px;
}
input[type='checkbox'] {
  accent-color: #409eff;
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
  border: 1px solid #dce3ec;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  background: white;
  color: #527da8;
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
  border: 1px solid #e4eaf2;
  text-align: center;
  padding: 4px 8px;
}
th {
  background: #f6f6f6;
  color: #8795a5;
  font-weight: 600;
}
.empty-catalog {
  color: #9aa5b3;
  font-size: 12px;
}
</style>
