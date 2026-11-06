<template>
  <el-dialog
    :model-value="modelValue"
    title="模块管理"
    top="24px"
    :close-on-click-modal="!definitionBusy"
    :close-on-press-escape="!definitionBusy"
    :show-close="!definitionBusy"
    width="min(1000px, 94vw)"
    class="module-manager"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p v-if="store.activeProject" class="library-scope-note">
      当前工程：{{ store.activeProject.name }} · CP
      {{ release }}。移除模块会保留配置数据，重新加入可恢复。
    </p>
    <details class="definition-import" aria-label="导入模块定义">
      <summary>高级：手工导入模块定义 ARXML</summary>
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
            :disabled="
              definitionBusy ||
              store.modules.some((item) => item.shortName === name && item.version === release)
            "
            :aria-label="'导入 ' + name"
          />
          {{ name
          }}{{
            store.modules.some((item) => item.shortName === name && item.version === release)
              ? '（已加载）'
              : ''
          }}
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
    </details>
    <label v-if="!store.activeProject" class="release-picker"
      >AUTOSAR 版本<select v-model="release" aria-label="模块目录版本">
        <option>4.4.0</option>
        <option>4.2.2</option>
      </select></label
    >
    <p class="catalog-summary">
      CP {{ release }} · {{ catalog.length }} 个模块 · 未支持项可查看原因
    </p>
    <ModuleSelector v-model="selected" :entries="catalog" :busy="definitionBusy">
      <template #head
        ><th>生成</th>
        <th>验证</th></template
      >
      <template #row="{ entry }"
        ><td>
          <input
            v-if="draft[moduleKey(entry.shortName, release)]"
            v-model="draft[moduleKey(entry.shortName, release)].generation"
            type="checkbox"
            :aria-label="entry.shortName + ' 生成'"
            :disabled="definitionBusy"
          />
        </td>
        <td>
          <input
            v-if="draft[moduleKey(entry.shortName, release)]"
            v-model="draft[moduleKey(entry.shortName, release)].validation"
            type="checkbox"
            :aria-label="entry.shortName + ' 验证'"
            :disabled="definitionBusy"
          /></td
      ></template>
    </ModuleSelector>
    <p v-if="definitionError" role="alert">{{ definitionError }}</p>
    <template #footer
      ><el-button :disabled="definitionBusy" @click="emit('update:modelValue', false)"
        >取消</el-button
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
import {
  builtinCatalog,
  readBuiltinModules,
  type BuiltinModuleEntry,
} from '@/modules/builtinCatalog';
import { moduleKey } from '@/core/bswmd/ModuleKey';
import { ElMessageBox } from 'element-plus';
import ModuleSelector from './ModuleSelector.vue';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; applied: [] }>();
const store = useConfigStore();
const release = ref(store.activeProject?.autosarVersion ?? store.module?.version ?? '4.4.0');
const catalog = computed<BuiltinModuleEntry[]>(() => {
  const entries = builtinCatalog.filter((entry) => entry.release === release.value);
  const loaded = store.modules.filter((module) => module.version === release.value);
  return [
    ...entries,
    ...loaded
      .filter((module) => !entries.some((entry) => entry.shortName === module.shortName))
      .map((module) => ({
        shortName: module.shortName,
        release: module.version,
        group: '已导入定义',
        asset: null,
        contentSha256: null,
        status: 'limited' as const,
        parsed: true,
        reason: '本机导入的定义；输出以实际校验结果为准',
        batch: null,
        diagnostics: module.importWarnings ?? [],
      })),
  ];
});
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
    if (pendingDefinitions.value.some((item) => item.version !== release.value)) {
      pendingDefinitions.value = [];
      throw new Error('源定义版本与当前模块目录不同，请切换到对应版本后导入');
    }
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
      draft.value[moduleKey(item.shortName, item.version)] = {
        ...store.getModulePreference(item.shortName, item.version),
      };
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
const selected = ref<string[]>([]);
function resetSelection(): void {
  draft.value = Object.fromEntries(
    catalog.value.map((item) => [
      moduleKey(item.shortName, release.value),
      { ...store.getModulePreference(item.shortName, release.value) },
    ])
  );
  selected.value = store.activeProject
    ? [...store.activeProject.moduleShortNames]
    : catalog.value
        .filter((item) => draft.value[moduleKey(item.shortName, release.value)].included)
        .map((item) => item.shortName);
  definitionError.value = '';
}
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    release.value = store.activeProject?.autosarVersion ?? store.module?.version ?? '4.4.0';
    resetSelection();
  },
  { immediate: true }
);
watch(release, resetSelection);
async function confirm(): Promise<void> {
  try {
    store.assertWritable();
  } catch (error) {
    definitionError.value = String(error);
    return;
  }
  const project = store.activeProject;
  if (project) {
    const removed = project.moduleShortNames.filter((name) => !selected.value.includes(name));
    try {
      await ElMessageBox.confirm(
        removed.length
          ? `移除 ${removed.join('、')} 并应用模块选择？配置数据会保留，重新加入可恢复。`
          : '将所选模块加入当前工程并保存？',
        '更新工程模块',
        { confirmButtonText: '应用变更', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
    definitionBusy.value = true;
    try {
      if (!(await store.updateProjectModules(project.projectUuid, selected.value, draft.value)))
        throw new Error(store.projectError ?? '模块变更未保存');
    } catch (error) {
      definitionError.value = error instanceof Error ? error.message : String(error);
      return;
    } finally {
      definitionBusy.value = false;
    }
  } else {
    definitionBusy.value = true;
    try {
      const missing = selected.value.filter(
        (name) =>
          !store.modules.some(
            (module) => module.shortName === name && module.version === release.value
          )
      );
      if (
        missing.length &&
        !(await store.importModuleDefinitions(await readBuiltinModules(missing, release.value)))
      )
        throw new Error(store.error ?? '模块保存失败');
      const previous = { ...store.modulePreferences };
      for (const entry of catalog.value) {
        const key = moduleKey(entry.shortName, release.value);
        store.modulePreferences[key] = {
          ...draft.value[key],
          included: selected.value.includes(entry.shortName),
        };
      }
      if (!(await store.saveConfig())) {
        store.modulePreferences = previous;
        throw new Error(store.error ?? '保存失败');
      }
    } catch (error) {
      definitionError.value = error instanceof Error ? error.message : String(error);
      return;
    } finally {
      definitionBusy.value = false;
    }
  }
  emit('applied');
  emit('update:modelValue', false);
}
</script>
<style scoped>
.library-scope-note {
  margin: 0 20px 12px;
  padding: 10px 12px;
  background: var(--color-panel);
  color: var(--color-muted);
  font-size: 13px;
}
.definition-import {
  padding-bottom: 12px;
  font-size: 13px;
}
.definition-import > summary {
  margin-bottom: 14px;
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
td,
th {
  text-align: center;
  padding: 4px 8px;
}
input[type='checkbox'] {
  accent-color: var(--color-accent);
}
:global(.module-manager .el-dialog__body) {
  max-height: calc(100vh - 160px);
  overflow: auto;
}
</style>

<style scoped>
.release-picker,
.catalog-summary {
  font-size: 13px;
  margin: 8px 20px;
  color: var(--color-muted);
}
.release-picker select {
  margin-left: 12px;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  padding: 6px;
}
.module-selector {
  margin: 12px 20px;
}
p[role='alert'] {
  color: var(--color-error);
  padding: 0 20px;
}
</style>
