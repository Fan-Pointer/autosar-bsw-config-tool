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
      <label v-if="format !== 'arxml'"
        >导入到<select
          v-model="target"
          aria-label="导入目标"
          :disabled="store.isImporting"
          @change="prepare"
        >
          <option v-if="!newOnly" value="current" :disabled="!store.config">
            当前配置集：{{ store.config?.name ?? '未打开' }}
          </option>
          <option value="new">新建配置集</option>
        </select></label
      >
    </div>
    <p class="import-help">
      文件仅在本机处理。预览后点击“应用导入”才会保存。未在文件中出现的配置集容器会保留。
    </p>
    <!-- G45：工程级 ARXML 含多个模块时，改为勾选导入。 -->
    <section v-if="multiModules.length" class="multi-import" aria-label="选择要导入的模块">
      <header>
        <strong v-if="multiModules.length > 1">该文件包含 {{ multiModules.length }} 个模块配置，请勾选要导入的模块</strong><strong v-else>文件包含 1 个模块：{{ multiModules[0]?.shortName }}，确认导入</strong>
        <label class="select-all"
          ><input type="checkbox" :checked="allSelected" @change="toggleAll" />全选</label
        >
      </header>
      <div class="project-target">
        <label
          ><input v-model="projectMode" type="radio" value="current" :disabled="!store.activeProject" />并入当前工程<span
            v-if="store.activeProject"
            class="muted"
            >（{{ store.activeProject.name }}）</span
          ></label
        >
        <label
          ><input v-model="projectMode" type="radio" value="new" />新建工程</label
        >
        <input
          v-if="projectMode === 'new'"
          v-model="newProjectName"
          class="project-name"
          placeholder="新工程名称"
          aria-label="新工程名称"
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>选择</th>
            <th>模块</th>
            <th>版本</th>
            <th>状态</th>
            <th>已有配置</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in multiModules" :key="item.shortName">
            <td>
              <input
                v-model="chosen"
                type="checkbox"
                :value="item.shortName"
                :disabled="item.versionMismatch || store.isImporting"
                :aria-label="'选择模块 ' + item.shortName"
              />
            </td>
            <td>{{ item.shortName }}</td>
            <td>{{ item.version }}</td>
            <td>
              <span v-if="item.versionMismatch" class="bad">版本与工程不一致，将跳过</span>
              <span v-else-if="item.existingSetUuid" class="warn">已有同模块配置</span>
              <span v-else-if="!item.loaded">将自动加载定义</span>
              <span v-else class="ok">就绪</span>
            </td>
            <td>
              <select
                v-if="item.existingSetUuid"
                :value="modes[item.shortName] ?? 'overwrite'"
                :aria-label="item.shortName + ' 处理方式'"
                :disabled="store.isImporting"
                @change="setMode(item.shortName, $event)"
              >
                <option value="overwrite">覆盖（文件里有的覆盖，其余保留）</option>
                <option value="skip">跳过</option>
              </select>
              <span v-else>新建配置集</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="multiResult" role="status" class="multi-result">{{ multiResult }}</p>
    </section>
    <fieldset v-if="format !== 'arxml'" class="strategies" :disabled="store.isImporting">
      <legend>冲突解决策略</legend>
      <label><input v-model="strategy" type="radio" value="overwrite" />覆盖</label>
      <label><input v-model="strategy" type="radio" value="skip" />跳过</label>
      <label><input v-model="strategy" type="radio" value="rename" />重命名</label>
    </fieldset>
    <p v-if="format !== 'arxml'" class="import-help">{{ strategyHelp[strategy] }}</p>
    <p v-if="reading" role="status">正在读取文件…</p>
    <el-alert
      v-for="warning in session?.warnings ?? []"
      :key="warning"
      :title="warning"
      type="warning"
      :closable="false"
      show-icon
    />
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
              <th>配置集值 / 配置集引用值</th>
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
        v-if="multiModules.length"
        type="primary"
        :disabled="!chosen.length || reading || store.isImporting"
        :loading="store.isImporting"
        @click="applyMulti"
        >导入选中模块（{{ chosen.length }}）</el-button
      ><el-button
        v-else
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

const props = defineProps<{ modelValue: boolean; format: ImportFormat; newOnly?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; imported: [] }>();
const store = useConfigStore();
const strategy = ref<ConflictStrategy>('overwrite');
const target = ref<'current' | 'new'>(props.newOnly || !store.config ? 'new' : 'current');
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
    target.value = props.newOnly || !store.config ? 'new' : 'current';
  }
);
const multiModules = ref<ReturnType<typeof store.scanArxmlImport>>([]);
const chosen = ref<string[]>([]);
const modes = ref<Record<string, 'overwrite' | 'skip'>>({});
const multiResult = ref('');
const projectMode = ref<'current' | 'new'>('current');
const newProjectName = ref('');
const fileNameBase = ref('');
const allSelected = computed(
  () => multiModules.value.length > 0 && chosen.value.length === multiModules.value.filter((item) => !item.versionMismatch).length
);
function toggleAll(): void {
  chosen.value = allSelected.value
    ? []
    : multiModules.value.filter((item) => !item.versionMismatch).map((item) => item.shortName);
}
function setMode(shortName: string, event: Event): void {
  const value = (event.target as HTMLSelectElement).value as 'overwrite' | 'skip';
  modes.value = { ...modes.value, [shortName]: value };
  if (value === 'skip') chosen.value = chosen.value.filter((name) => name !== shortName);
}
async function applyMulti(): Promise<void> {
  if (!chosen.value.length) return;
  multiResult.value = '';
  try {
    if (projectMode.value === 'new' && !newProjectName.value.trim()) {
      error.value = '请填写新工程名称';
      return;
    }
    const notes = await store.importArxmlModules(
      content,
      chosen.value.map((shortName) => ({
        shortName,
        mode: modes.value[shortName] ?? 'overwrite',
      })),
      {
        // 选「新建工程」时把名称交给 store 建工程；否则并入当前工程。
        ...(projectMode.value === 'new' ? { newProjectName: newProjectName.value } : {}),
        // 复用已扫描结果，避免二次解析导致「文件里没有可导入的模块」误报。
        headers: multiModules.value.map((item) => ({
          shortName: item.shortName,
          definitionPath: `/AUTOSAR/${item.shortName}`,
          release: item.version,
          uuid: '',
        })),
      }
    );
    ElMessage.success('导入完成，已保存到本机');
    multiResult.value = notes.join('；');
    emit('imported');
    multiModules.value = [];
    chosen.value = [];
    emit('update:modelValue', false);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    error.value = message;
    ElMessage.error(message);
  }
}
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
  fileNameBase.value = file.name.replace(/\.[^.]+$/, '');
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
    multiModules.value = [];
    chosen.value = [];
    modes.value = {};
    multiResult.value = '';
    if (props.format === 'arxml') {
      const scanned = store.scanArxmlImport(text);
      const only = scanned[0];
      const sameAsCurrent =
        scanned.length === 1 &&
        store.config !== null &&
        only.shortName === store.config.moduleRef &&
        only.version === store.config.version;
      if (scanned.length === 1 && only.versionMismatch)
        throw new Error(
          `模块 ${only.shortName} 的版本（${only.version}）与当前工程不一致，不能跨版本导入`
        );
      // 单模块且与当前配置集同模块：沿用原有预览流程（可看冲突明细与解析告警）。
      if (sameAsCurrent && only.loaded) {
        prepare();
        return;
      }
      // 其余情况（多模块 / 定义未加载 / 与当前配置集不同）统一走勾选导入：
      // 自动加载定义、空壳补骨架、并入工程，不再因「模块与当前配置集不一致」直接报错。
      multiModules.value = scanned;
      chosen.value = scanned.filter((item) => !item.versionMismatch).map((item) => item.shortName);
      modes.value = Object.fromEntries(scanned.map((item) => [item.shortName, 'overwrite']));
      projectMode.value = store.activeProject ? 'current' : 'new';
      newProjectName.value = store.activeProject ? '' : (fileNameBase.value || '导入工程');
      return;
    }
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
  if (await store.applyImport(session.value, strategy.value).catch(() => false)) {
    ElMessage.success('导入完成，已保存到本机');
    emit('imported');
    emit('update:modelValue', false);
  } else error.value = store.error ?? '导入失败，配置集未改变';
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
.project-target {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 10px 0;
  font-size: 13px;
}
.project-target label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.project-target .muted {
  color: var(--color-muted);
}
.project-name {
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.multi-import {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 12px 14px;
  margin: 12px 0;
}
.multi-import header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
}
.multi-import table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.multi-import th,
.multi-import td {
  border-bottom: 1px solid var(--color-border);
  padding: 6px 8px;
  text-align: left;
}
.multi-import select {
  min-height: 26px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}
.multi-import .bad {
  color: var(--color-error);
}
.multi-import .warn {
  color: var(--color-warning);
}
.multi-import .ok {
  color: var(--color-success);
}
.multi-result {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--color-muted);
  line-height: 1.6;
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
