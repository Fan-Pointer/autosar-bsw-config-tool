<template>
  <div class="module-selector" :aria-busy="busy">
    <section class="selection-panel">
      <header>
        <strong>可选模块</strong><span>{{ available.length }} / {{ entries.length }}</span>
      </header>
      <input v-model="leftSearch" type="search" placeholder="搜索模块" aria-label="搜索可用模块" />
      <label class="select-visible"
        ><input
          type="checkbox"
          :checked="allChecked"
          :disabled="busy || !selectable.length"
          @change="toggleAll(($event.target as HTMLInputElement).checked)"
        />选择当前结果</label
      >
      <div class="module-list">
        <details v-for="group in groups" :key="group" open>
          <summary>{{ group }}</summary>
          <div
            v-for="entry in filtered.filter((item) => item.group === group)"
            :key="entry.shortName"
            class="module-option"
            :class="{ unavailable: entry.status === 'unsupported' }"
            :title="entry.status === 'unsupported' ? entry.reason : undefined"
            :aria-description="entry.status === 'unsupported' ? entry.reason : undefined"
            tabindex="0"
          >
            <label
              ><input
                v-model="leftChecked"
                type="checkbox"
                :value="entry.shortName"
                :aria-label="'选择 ' + entry.shortName"
                :disabled="busy || entry.status === 'unsupported'"
              />
              <span>{{ entry.shortName }}</span
              ><small v-if="entry.status === 'unsupported'">待支持</small
              ><small v-else-if="entry.status === 'limited'">有限制</small>
            </label>
          </div>
        </details>
        <p v-if="!filtered.length" class="empty">没有匹配的模块</p>
      </div>
    </section>
    <div class="selection-actions">
      <button
        type="button"
        aria-label="加入模块"
        :disabled="busy || !leftChecked.length"
        @click="include"
      >
        ›</button
      ><button
        type="button"
        aria-label="移除模块"
        :disabled="busy || !rightChecked.length"
        @click="exclude"
      >
        ‹
      </button>
    </div>
    <section class="selection-panel">
      <header>
        <strong>已选模块</strong><span>{{ modelValue.length }}</span>
      </header>
      <input
        v-model="rightSearch"
        type="search"
        placeholder="搜索已选模块"
        aria-label="搜索已选模块"
      />
      <div class="module-list selected-list">
        <table v-if="selected.length">
          <thead>
            <tr>
              <th>选择</th>
              <th>模块</th>
              <th>状态</th>
              <slot name="head" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in selected" :key="entry.shortName">
              <td>
                <input
                  v-model="rightChecked"
                  type="checkbox"
                  :value="entry.shortName"
                  :disabled="busy"
                  :aria-label="'选择模块 ' + entry.shortName"
                />
              </td>
              <td>
                <strong>{{ entry.shortName }}</strong
                ><small>CP {{ entry.release }}</small>
              </td>
              <td>
                {{
                  entry.status === 'limited'
                    ? '有限制'
                    : entry.status === 'unsupported'
                      ? '待支持'
                      : '可配置'
                }}
              </td>
              <slot name="row" :entry="entry" />
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">从左侧选择需要配置的模块</p>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BuiltinModuleEntry } from '@/modules/builtinCatalog';
const props = defineProps<{
  entries: readonly BuiltinModuleEntry[];
  modelValue: string[];
  busy?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [names: string[]] }>();
const leftSearch = ref(''),
  rightSearch = ref('');
const leftChecked = ref<string[]>([]),
  rightChecked = ref<string[]>([]);
const available = computed(() =>
  props.entries.filter((entry) => !props.modelValue.includes(entry.shortName))
);
const filtered = computed(() =>
  available.value.filter((entry) =>
    entry.shortName.toLowerCase().includes(leftSearch.value.trim().toLowerCase())
  )
);
const groups = computed(() => [...new Set(filtered.value.map((entry) => entry.group))]);
const selectable = computed(() => filtered.value.filter((entry) => entry.status !== 'unsupported'));
const allChecked = computed(
  () =>
    selectable.value.length > 0 &&
    selectable.value.every((entry) => leftChecked.value.includes(entry.shortName))
);
const selected = computed(() =>
  props.entries.filter(
    (entry) =>
      props.modelValue.includes(entry.shortName) &&
      entry.shortName.toLowerCase().includes(rightSearch.value.trim().toLowerCase())
  )
);
watch(
  () => props.entries,
  () => {
    leftChecked.value = [];
    rightChecked.value = [];
  }
);
function toggleAll(checked: boolean): void {
  leftChecked.value = checked ? selectable.value.map((entry) => entry.shortName) : [];
}
function include(): void {
  const allowed = available.value.filter(
    (entry) => entry.status !== 'unsupported' && leftChecked.value.includes(entry.shortName)
  );
  emit('update:modelValue', [
    ...new Set([...props.modelValue, ...allowed.map((entry) => entry.shortName)]),
  ]);
  leftChecked.value = [];
}
function exclude(): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((name) => !rightChecked.value.includes(name))
  );
  rightChecked.value = [];
}
</script>
<style scoped>
.module-selector {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr);
  gap: 12px;
  min-height: calc(var(--module-list-height, clamp(160px, 32vh, 280px)) + 30px);
  color: var(--color-text);
}
.selection-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--color-surface);
}
header {
  display: flex;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
}
header span {
  color: var(--color-muted);
  font-size: 12px;
}
input[type='search'] {
  margin: 12px;
  width: calc(100% - 24px);
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 13px;
}
.select-visible {
  padding: 0 12px 8px;
  font-size: 12px;
  color: var(--color-muted);
}
.module-list {
  height: var(--module-list-height, clamp(160px, 32vh, 280px));
  overflow: auto;
  padding: 0 10px 10px;
  scrollbar-gutter: stable;
}
.selected-list {
  height: calc(var(--module-list-height, clamp(160px, 32vh, 280px)) + 30px);
}
summary {
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 4px;
  color: var(--color-muted);
}
.module-option {
  padding: 6px 5px;
  border-radius: 4px;
  outline-offset: -2px;
}
.module-option:hover,
.module-option:focus-visible {
  background: var(--color-selected);
}
.module-option label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 13px;
}
.module-option small {
  margin-left: auto;
  color: var(--color-muted);
  font-size: 10px;
  white-space: nowrap;
}
.unavailable {
  color: var(--color-muted);
}
.selection-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
}
.selection-actions button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-accent);
  font-size: 23px;
  cursor: pointer;
}
.selection-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  text-align: left;
  padding: 10px 5px;
  border-bottom: 1px solid var(--color-border);
}
th {
  font-weight: 500;
  color: var(--color-muted);
}
td small {
  display: block;
  font-size: 10px;
  color: var(--color-muted);
  margin-top: 4px;
}
input[type='checkbox'] {
  accent-color: var(--color-accent);
}
.empty {
  font-size: 12px;
  color: var(--color-muted);
  text-align: center;
  margin-top: 24px;
}
@media (max-width: 600px) {
  .module-selector {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .selection-actions {
    flex-direction: row;
  }
  .selection-actions button {
    transform: rotate(90deg);
  }
  .module-list,
  .selected-list {
    height: 190px;
  }
}
</style>
