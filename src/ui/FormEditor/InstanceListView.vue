<template>
  <div class="instance-list" aria-label="实例列表视图">
    <div v-for="group in groups" :key="group.definition.uuid" class="instance-group">
      <h3 class="group-title">
        {{ group.definition.shortName }}
        <small>{{ group.rows.length }} 个实例</small>
      </h3>
      <div class="list-toolbar">
        <el-button size="small" :aria-label="'列设置 ' + group.definition.shortName" @click="openColumnSettings(group)">
          列设置
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!checkedRows(group).length"
          :aria-label="'批量编辑 ' + group.definition.shortName"
          @click="emit('batch-edit', checkedUuids())"
          >批量编辑（{{ checkedRows(group).length }}）</el-button
        >
        <el-checkbox
          :model-value="allChecked(group)"
          :aria-label="'全选 ' + group.definition.shortName"
          @change="toggleAll(group, ($event.target as HTMLInputElement).checked)"
          >全选</el-checkbox
        >
      </div>
      <table class="instance-table">
        <thead>
          <tr>
            <th class="check-col" aria-label="选择" />
            <th class="index-col">#</th>
            <th class="name-col">containerName</th>
            <th v-for="column in visibleColumns(group)" :key="column.uuid">{{ column.shortName }}</th>
            <th class="open-col" aria-label="打开" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in group.rows" :key="row.uuid">
            <td class="check-col">
              <input
                type="checkbox"
                :aria-label="'选择 ' + row.shortName"
                :checked="checked.includes(row.uuid)"
                @change="toggleRow(row.uuid, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="index-col">{{ rowIndex + 1 }}</td>
            <td class="name-col">
              <button class="row-name" type="button" @click="emit('open', row.uuid)">
                {{ row.shortName }}
              </button>
            </td>
            <td v-for="column in visibleColumns(group)" :key="column.uuid" class="value-cell">
              {{ formatValue(row.values[column.uuid]) }}
            </td>
            <td class="open-col">
              <button class="row-open" type="button" :aria-label="'打开 ' + row.shortName" @click="emit('open', row.uuid)">
                打开
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!group.rows.length" class="empty-row" role="status">暂无数据</p>
    </div>

    <div v-if="columnGroup" class="column-settings" role="dialog" aria-label="选择显示配置项">
      <p class="fixed-hint">containerName 为固定列，不可取消。</p>
      <label
        v-for="column in columnGroup.definition.parameters"
        :key="column.uuid"
        class="column-option"
      >
        <input
          type="checkbox"
          :checked="!hidden[column.uuid]"
          @change="toggleColumn(column.uuid, ($event.target as HTMLInputElement).checked)"
        />
        {{ column.shortName }}
      </label>
      <div class="column-actions">
        <button type="button" @click="columnGroup = undefined">取消</button>
        <button type="button" class="primary" @click="columnGroup = undefined">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';

export interface InstanceListRow {
  uuid: string;
  shortName: string;
  values: Record<string, unknown>;
}
export interface InstanceListGroup {
  definition: BswmdContainer;
  rows: InstanceListRow[];
}

defineProps<{ groups: InstanceListGroup[] }>();
const emit = defineEmits<{
  open: [instanceUuid: string];
  'batch-edit': [instanceUuids: string[]];
}>();

const checked = ref<string[]>([]);
const hidden = reactive<Record<string, boolean>>({});
const columnGroup = ref<InstanceListGroup>();

function visibleColumns(group: InstanceListGroup): BswmdParameter[] {
  return group.definition.parameters.filter((column) => !hidden[column.uuid]);
}
function checkedRows(group: InstanceListGroup): InstanceListRow[] {
  return group.rows.filter((row) => checked.value.includes(row.uuid));
}
function checkedUuids(): string[] {
  return [...checked.value];
}
function allChecked(group: InstanceListGroup): boolean {
  return group.rows.length > 0 && group.rows.every((row) => checked.value.includes(row.uuid));
}
function toggleAll(group: InstanceListGroup, checkedAll: boolean): void {
  const others = checked.value.filter((uuid) => !group.rows.some((row) => row.uuid === uuid));
  checked.value = checkedAll ? [...others, ...group.rows.map((row) => row.uuid)] : others;
}
function toggleRow(uuid: string, checkedRow: boolean): void {
  checked.value = checkedRow ? [...checked.value, uuid] : checked.value.filter((id) => id !== uuid);
}
function openColumnSettings(group: InstanceListGroup): void {
  columnGroup.value = group;
}
function toggleColumn(uuid: string, visible: boolean): void {
  if (visible) delete hidden[uuid];
  else hidden[uuid] = true;
}
function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '--';
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
  return String(value);
}
</script>

<style scoped>
.instance-list {
  padding: 8px 22px 16px;
  font-size: 13px;
  color: var(--color-text);
}
.group-title {
  margin: 14px 0 6px;
  font-size: 14px;
}
.group-title small {
  color: var(--color-muted);
  font-weight: normal;
  margin-left: 8px;
}
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.instance-table {
  width: 100%;
  border-collapse: collapse;
}
.instance-table th,
.instance-table td {
  border: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
  overflow-wrap: anywhere;
}
.check-col,
.index-col {
  width: 40px;
  text-align: center;
}
.name-col {
  min-width: 140px;
}
.value-cell {
  color: var(--color-muted);
}
.row-name,
.row-open {
  border: 0;
  background: transparent;
  color: var(--color-accent);
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.fixed-hint {
  color: var(--color-muted);
  font-size: 12px;
  margin-bottom: 8px;
}
.column-option {
  display: block;
  padding: 6px 0;
  cursor: pointer;
}
.column-settings {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #0006;
}
.column-settings > * {
  background: var(--color-surface);
  padding: 6px 0;
}
.column-settings .fixed-hint {
  color: var(--color-muted);
  font-size: 12px;
  padding: 6px 20px 0;
}
.column-option {
  display: block;
  width: 280px;
  padding: 6px 20px;
  cursor: pointer;
}
.column-actions {
  display: flex;
  gap: 10px;
  padding: 10px 20px 16px;
}
.column-actions button {
  border: 1px solid var(--color-border);
  background: var(--color-panel);
  color: var(--color-text);
  font: inherit;
  padding: 6px 18px;
  border-radius: 3px;
  cursor: pointer;
}
.column-actions button.primary {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.empty-row {
  color: var(--color-muted);
  margin: 8px 0;
}
</style>
