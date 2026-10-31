<template>
  <div
    class="workspace-container"
    @click="
      contextMenu = undefined;
      projectMenu = undefined;
    "
    @keydown.esc="
      contextMenu = undefined;
      projectMenu = undefined;
    "
  >
    <header class="workspace-header">
      <span class="brand-symbol">☷</span><span class="brand">BSW Configurator</span>
      <div class="toolbar-group">
        <button
          class="tool-button"
          title="保存到本机"
          aria-label="保存到本机"
          :disabled="!store.config"
          @click="saveConfig"
        >
          <el-icon><DocumentChecked /></el-icon>
        </button>
        <button
          class="tool-button green"
          title="代码验证"
          aria-label="代码验证"
          :disabled="!operationEnabled('validation')"
          @click="validate"
        >
          <el-icon><CircleCheck /></el-icon>
        </button>
        <button
          class="tool-button green"
          title="生成 C 代码"
          aria-label="生成 C 代码"
          :disabled="!operationEnabled('generation')"
          @click="generateCode"
        >
          <el-icon><VideoPlay /></el-icon><span class="sr-only">生成 C 代码</span>
        </button>
      </div>
      <div class="toolbar-group">
        <button
          class="tool-button amber"
          title="配置集管理"
          aria-label="配置集管理"
          @click.stop="showSets = !showSets"
        >
          <el-icon><FolderOpened /></el-icon>
        </button>
        <button
          class="tool-button amber"
          title="模块管理"
          aria-label="模块管理"
          @click="showModules = true"
        >
          <el-icon><SetUp /></el-icon>
        </button>
      </div>
      <div class="toolbar-group">
        <button
          class="tool-button"
          title="验证结果"
          aria-label="验证结果"
          @click="showValidation = !showValidation"
        >
          <el-icon><Search /></el-icon>
        </button>
        <button
          class="tool-button"
          title="返回配置集列表"
          aria-label="返回配置集列表"
          @click="router.push('/')"
        >
          <el-icon><Back /></el-icon>
        </button>
      </div>
      <span v-if="store.isDirty" class="dirty-indicator" title="配置有未保存修改">●</span>
      <span class="toolbar-spacer" /><span class="language">简体中文⌄</span
      ><span class="avatar">配</span>
    </header>
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
    <main class="workspace-main">
      <aside
        class="project-panel"
        :style="{ width: (projectCollapsed ? 30 : projectWidth) + 'px' }"
      >
        <div class="project-heading">
          <span v-if="!projectCollapsed">🗂工程目录</span
          ><button
            :aria-label="projectCollapsed ? '展开工程目录' : '折叠工程目录'"
            @click="projectCollapsed = !projectCollapsed"
          >
            {{ projectCollapsed ? '›' : '‹' }}
          </button>
        </div>
        <div v-show="!projectCollapsed" class="project-tree">
          <div
            class="project-root"
            tabindex="0"
            @contextmenu.prevent.stop="openProjectMenu"
            @keydown.shift.f10.prevent="openProjectMenu"
          >
            <span class="folder">▱</span
            ><span class="project-name">{{ store.config?.name ?? '本机工程' }}</span
            ><span>⌃</span>
          </div>
          <details open>
            <summary class="module-management" @dblclick="showModules = true">
              <span class="folder">⚙</span>模块管理
            </summary>
            <details open class="module-group">
              <summary><span class="folder">▱</span>BSW Modules</summary>
              <button
                v-for="item in includedModules"
                :key="item.shortName"
                class="module-node"
                :class="{ selected: activeOpen && store.module?.shortName === item.shortName }"
                @click="openModule(item.shortName)"
              >
                <span class="module-symbol">M</span>{{ item.shortName }}
              </button>
            </details>
          </details>
          <details
            v-for="folder in ['RTE', 'AUTOSAR文件', '输出文件', '输入文件']"
            :key="folder"
            class="project-folder"
          >
            <summary
              :title="folder === '输出文件' ? '生成代码后可在预览中下载' : '未核实，待补充截图'"
            >
              <span class="folder">▱</span>{{ folder }}
            </summary>
          </details>
          <button v-if="!store.config" class="empty-project" @click.stop="showSets = true">
            暂无配置集 · 点击创建
          </button>
        </div>
      </aside>
      <div
        v-if="!projectCollapsed"
        class="splitter"
        role="separator"
        aria-label="工程目录宽度"
        aria-orientation="vertical"
        tabindex="0"
        @pointerdown="startResize('project', $event)"
        @keydown.left.prevent="projectWidth = Math.max(170, projectWidth - 10)"
        @keydown.right.prevent="projectWidth = Math.min(360, projectWidth + 10)"
      />
      <section class="editor">
        <div class="module-tabs" role="tablist" aria-label="模块">
          <div
            v-for="uuid in opened"
            :key="uuid"
            class="module-tab"
            :class="{ active: uuid === store.activeUuid }"
          >
            <button
              role="tab"
              :aria-selected="uuid === store.activeUuid"
              @click="store.switchConfigSet(uuid)"
            >
              <span class="module-symbol">M</span>{{ tabLabel(uuid) }}
            </button>
            <button
              class="close-tab"
              :aria-label="'关闭 ' + tabLabel(uuid)"
              @click="closeTab(uuid)"
            >
              ×
            </button>
          </div>
        </div>
        <div v-if="activeOpen" class="editor-body">
          <aside class="configuration-panel" :style="{ width: treeWidth + 'px' }">
            <ContainerNavigator
              :width="treeWidth"
              @actions="showActions = !showActions"
              @context="openContextMenu"
              @selected="showActions = false"
            />
          </aside>
          <div
            class="splitter"
            role="separator"
            aria-label="配置树宽度"
            aria-orientation="vertical"
            tabindex="0"
            @pointerdown="startResize('tree', $event)"
            @keydown.left.prevent="treeWidth = Math.max(190, treeWidth - 10)"
            @keydown.right.prevent="treeWidth = Math.min(420, treeWidth + 10)"
          />
          <section class="parameter-panel">
            <nav class="breadcrumbs" aria-label="实例路径">
              <span class="folder">▱</span><span>{{ store.module?.shortName }}</span
              ><template v-for="(part, index) in breadcrumb" :key="index"
                ><span class="crumb-arrow">›</span
                ><span :class="{ 'crumb-parent': index === breadcrumb.length - 2 }">{{
                  part
                }}</span></template
              >
            </nav>
            <template v-if="store.selectedEntry">
              <div class="instance-name">
                <label for="instance-name">实例名称</label
                ><el-input
                  id="instance-name"
                  :model-value="store.selectedEntry.container.shortName"
                  @change="rename"
                />
              </div>
              <DynamicForm
                :key="store.selectedEntry.container.uuid"
                :container="store.selectedEntry.definition"
                :config-data="store.parameterData"
                :reference-data="store.referenceData"
                :reference-options="store.referenceOptions"
                @parameter-change="store.setParameterValue"
                @reference-change="store.setReferenceTarget"
              />
              <div
                v-if="
                  !store.selectedEntry.container.subContainers.length && store.childOptions.length
                "
                class="empty-children"
              >
                <el-button
                  v-for="option in store.childOptions"
                  :key="option.definition.uuid"
                  size="small"
                  text
                  :disabled="Boolean(option.disabledReason)"
                  :title="option.disabledReason"
                  @click="addFirst(option.definition.uuid)"
                  >{{
                    option.definition.initialAddLabel ?? '添加 ' + option.definition.shortName
                  }}</el-button
                >
              </div>
            </template>
          </section>
        </div>
        <div v-else class="empty-editor" />
      </section>
    </main>
    <section
      v-show="showSets"
      class="utility-panel config-library"
      aria-label="配置集管理面板"
      @click.stop
    >
      <div class="utility-heading">
        配置集管理<button aria-label="关闭配置集管理" @click="showSets = false">×</button>
      </div>
      <ConfigSetManager @opened="showSets = false" />
    </section>
    <section v-show="showValidation" class="utility-panel validation-popup" @click.stop>
      <div class="utility-heading">
        验证结果<button aria-label="关闭验证结果" @click="showValidation = false">×</button>
      </div>
      <ValidationPanel
        :violations="store.violations"
        :validated="store.validated"
        @validate="store.validate()"
        @navigate="navigateViolation"
      />
    </section>
    <section
      v-show="showActions && activeOpen"
      class="utility-panel instance-actions"
      :style="{ left: projectWidth + treeWidth + 'px' }"
      @click.stop
    >
      <ContainerActions v-if="store.config" @navigate="navigateViolation" />
    </section>
    <ContainerActions
      v-if="contextMenu"
      context
      class="floating-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
      @close="contextMenu = undefined"
      @navigate="navigateViolation"
    />
    <div
      v-if="projectMenu"
      class="project-menu"
      role="menu"
      :style="{ left: projectMenu.x + 'px', top: projectMenu.y + 'px' }"
      @click.stop
    >
      <template v-for="(item, index) in menuItems" :key="index">
        <hr v-if="item.separator" />
        <span v-else :title="item.disabled ? '未核实，待补充截图' : undefined"
          ><button role="menuitem" :disabled="item.disabled" @click="projectAction(item.action)">
            <span>{{ item.label }}</span
            ><span v-if="item.submenu">›</span>
          </button></span
        >
      </template>
    </div>
    <ModuleManager v-model="showModules" @applied="reconcileModules" />
    <el-dialog v-model="showGenerated" title="生成的 C 配置文件" width="80%">
      <el-tabs
        ><el-tab-pane v-for="file in generatedFiles" :key="file.filename" :label="file.filename"
          ><el-button size="small" @click="downloadFile(file)">下载 {{ file.filename }}</el-button>
          <pre class="generated-code">{{ file.content }}</pre>
        </el-tab-pane></el-tabs
      >
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  Back,
  CircleCheck,
  DocumentChecked,
  FolderOpened,
  Search,
  SetUp,
  VideoPlay,
} from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import { CGenerator } from '@/core/generator/CGenerator';
import type { GeneratedFile } from '@/core/generator/TemplateEngine';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import DynamicForm from '@/ui/FormEditor/DynamicForm.vue';
import ContainerNavigator from '@/ui/ConfigTree/ContainerNavigator.vue';
import ValidationPanel from '@/ui/Validator/ValidationPanel.vue';
import ConfigSetManager from '@/ui/ConfigSets/ConfigSetManager.vue';
import ContainerActions from '@/ui/ConfigTree/ContainerActions.vue';
import ModuleManager from '@/ui/Modules/ModuleManager.vue';
const router = useRouter(),
  store = useConfigStore();
const generatedFiles = ref<GeneratedFile[]>([]),
  showGenerated = ref(false);
const showSets = ref(false),
  showModules = ref(false),
  showValidation = ref(false),
  showActions = ref(false);
const opened = ref<string[]>([]);
const contextMenu = ref<{ x: number; y: number }>(),
  projectMenu = ref<{ x: number; y: number }>();
const projectWidth = ref(212),
  treeWidth = ref(240),
  projectCollapsed = ref(false);
const activeOpen = computed(() =>
  Boolean(store.activeUuid && opened.value.includes(store.activeUuid))
);
const includedModules = computed(() =>
  store.modules.filter((item) => store.modulePreferences[item.shortName]?.included)
);
const breadcrumb = computed(() => {
  const entry = store.selectedEntry;
  if (!entry) return [];
  const path = entry.path.split('/');
  if (path.length === 1) path.unshift(entry.definition.shortName);
  return path;
});
const menuItems = [
  { label: '新建', submenu: true, disabled: true },
  { label: '工程管理', submenu: true, disabled: true },
  { label: '模块管理', submenu: true, action: 'modules' },
  { separator: true },
  { label: '代码验证', action: 'validate' },
  { label: '代码生成', action: 'generate' },
  { label: '导入', submenu: true, disabled: true },
  { label: '导出', submenu: true, disabled: true },
  { separator: true },
  { label: '自动计算', disabled: true },
  { label: '关闭工程', action: 'close' },
];
watch(
  () => store.activeUuid,
  (uuid) => {
    contextMenu.value = undefined;
    showGenerated.value = false;
    opened.value = opened.value.filter((id) => store.configSets.some((set) => set.uuid === id));
    if (
      uuid &&
      store.module &&
      store.modulePreferences[store.module.shortName]?.included &&
      !opened.value.includes(uuid)
    )
      opened.value.push(uuid);
  },
  { immediate: true }
);
onMounted(async () => {
  await store.initialize();
  window.addEventListener('beforeunload', warnUnsaved);
});
onUnmounted(() => {
  window.removeEventListener('beforeunload', warnUnsaved);
  stopResize();
});
onBeforeRouteLeave(() => !store.isDirty || store.saveConfig());
function warnUnsaved(event: BeforeUnloadEvent): void {
  if (store.isDirty) {
    event.preventDefault();
    event.returnValue = '';
  }
}
function operationEnabled(operation: 'generation' | 'validation'): boolean {
  return Boolean(
    store.config && store.module && store.modulePreferences[store.module.shortName]?.[operation]
  );
}
function tabLabel(uuid: string): string {
  const set = store.configSets.find((item) => item.uuid === uuid);
  return set ? set.moduleRef + '(' + set.name + ')' : '';
}
async function openModule(name: string): Promise<void> {
  const existing = store.configSets.find((item) => item.moduleRef === name);
  if (existing) {
    if (!(await store.switchConfigSet(existing.uuid))) return;
  } else if (!(await store.createConfigSet(name + ' 配置', name))) return;
  if (store.activeUuid && !opened.value.includes(store.activeUuid))
    opened.value.push(store.activeUuid);
}
async function closeTab(uuid: string): Promise<void> {
  if (store.isDirty && !(await store.saveConfig())) return;
  opened.value = opened.value.filter((id) => id !== uuid);
  if (store.activeUuid === uuid && opened.value.length)
    await store.switchConfigSet(opened.value[opened.value.length - 1]);
}
function reconcileModules(): void {
  opened.value = opened.value.filter((id) => {
    const set = store.configSets.find((item) => item.uuid === id);
    return set && store.modulePreferences[set.moduleRef]?.included;
  });
}
async function addFirst(uuid: string): Promise<void> {
  try {
    store.addContainerInstance(uuid);
    await store.saveConfig();
  } catch (reason) {
    ElMessage.error(String(reason));
  }
}
function rename(name: string): void {
  try {
    store.renameContainer(name);
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
function position(event: MouseEvent | KeyboardEvent) {
  return {
    x: Math.min('clientX' in event ? event.clientX : 160, window.innerWidth - 310),
    y: Math.min('clientY' in event ? event.clientY : 80, window.innerHeight - 370),
  };
}
function openContextMenu(event: MouseEvent): void {
  contextMenu.value = position(event);
}
function openProjectMenu(event: MouseEvent | KeyboardEvent): void {
  projectMenu.value = position(event);
}
async function projectAction(action?: string): Promise<void> {
  projectMenu.value = undefined;
  if (action === 'modules') showModules.value = true;
  if (action === 'validate' && operationEnabled('validation')) validate();
  if (action === 'generate' && operationEnabled('generation')) await generateCode();
  if (action === 'close' && (!store.isDirty || (await store.saveConfig()))) opened.value = [];
}
function validate(): void {
  store.validate();
  showValidation.value = true;
}
async function focusField(uuid?: string): Promise<void> {
  if (!uuid) return;
  await nextTick();
  const field = document.getElementById('field-' + uuid);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus();
}
function navigateViolation(violation: ConstraintViolation): void {
  if (!violation.containerUuid) return;
  if (store.activeUuid && !opened.value.includes(store.activeUuid))
    opened.value.push(store.activeUuid);
  store.selectContainer(violation.containerUuid, violation.definitionRef);
  showValidation.value = false;
  void focusField(violation.definitionRef);
}
async function saveConfig(): Promise<void> {
  if (await store.saveConfig()) ElMessage.success('已保存到本机');
}
async function generateCode(): Promise<void> {
  if (!store.config || !store.module) return;
  if (store.validate().some((item) => item.severity === 'ERROR')) {
    ElMessage.warning('请先修复验证错误');
    showValidation.value = true;
    return;
  }
  try {
    const generator = new CGenerator();
    generatedFiles.value = await Promise.all([
      generator.generateHeader(store.config, store.module),
      generator.generateSource(store.config, store.module),
    ]);
    showGenerated.value = true;
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
function downloadFile(file: GeneratedFile): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
let resize: { kind: 'project' | 'tree'; x: number; width: number } | undefined;
function startResize(kind: 'project' | 'tree', event: PointerEvent): void {
  resize = {
    kind,
    x: event.clientX,
    width: kind === 'project' ? projectWidth.value : treeWidth.value,
  };
  document.addEventListener('pointermove', moveResize);
  document.addEventListener('pointerup', stopResize);
  event.preventDefault();
}
function moveResize(event: PointerEvent): void {
  if (!resize) return;
  const width = resize.width + event.clientX - resize.x;
  if (resize.kind === 'project') projectWidth.value = Math.max(170, Math.min(360, width));
  else treeWidth.value = Math.max(190, Math.min(420, width));
}
function stopResize(): void {
  resize = undefined;
  document.removeEventListener('pointermove', moveResize);
  document.removeEventListener('pointerup', stopResize);
}
</script>
<style scoped>
.workspace-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: #314b63;
  background: #f7f7f7;
  font-size: 14px;
  overflow: hidden;
}
.workspace-header {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  background: #f5f5f5;
  border-top: 1px solid #d0d4d8;
  border-bottom: 1px solid #cdd1d6;
}
.brand-symbol {
  font-size: 15px;
  color: #6d8bb6;
}
.brand {
  color: #153047;
  font-size: 14px;
  white-space: nowrap;
  margin-right: 3px;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 3px;
  border-right: 1px solid #d1d6dc;
  padding-right: 9px;
}
.tool-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 27px;
  border: 0;
  background: transparent;
  color: #65839c;
  cursor: pointer;
  font-size: 17px;
}
.tool-button:hover {
  background: #e2eef9;
}
.tool-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.green {
  color: #3a9750;
}
.amber {
  color: #ad8435;
}
.toolbar-spacer {
  flex: 1;
}
.dirty-indicator {
  color: #db9d31;
  font-size: 10px;
}
.language {
  color: #617284;
  font-size: 13px;
}
.avatar {
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #409eff;
  color: white;
  text-align: center;
  line-height: 27px;
  margin-left: 12px;
}
.workspace-main {
  flex: 1;
  min-height: 0;
  display: flex;
}
.project-panel {
  flex-shrink: 0;
  background: #f4f4f4;
  overflow: hidden;
}
.project-heading {
  height: 31px;
  margin: 0 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #cdd1d6;
  font-size: 13px;
}
.project-heading button {
  margin-left: auto;
  border: 0;
  background: none;
  color: #7c858b;
  font-size: 23px;
  cursor: pointer;
}
.project-tree {
  overflow: auto;
  height: calc(100% - 31px);
}
.project-root {
  height: 31px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 13px;
  cursor: context-menu;
}
.project-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.folder {
  color: #af7d2e;
  display: inline-block;
  width: 18px;
}
.project-tree summary {
  height: 30px;
  line-height: 30px;
  cursor: pointer;
  list-style: none;
  white-space: nowrap;
}
.project-tree summary::after {
  content: '⌃';
  float: right;
  margin-right: 17px;
  color: #7d8790;
  font-size: 11px;
}
.project-tree details:not([open]) > summary::after {
  content: '⌄';
}
.module-management {
  padding-left: 32px;
}
.module-group > summary {
  padding-left: 53px;
}
.module-node {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  height: 30px;
  padding: 0 10px 0 74px;
  color: #35516a;
  cursor: pointer;
  font-size: 14px;
}
.module-node.selected {
  background: #d9edff;
  color: #2794ff;
}
.module-symbol {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #a5793f;
  color: white;
  font-size: 8px;
  font-weight: bold;
  line-height: 13px;
  text-align: center;
  flex-shrink: 0;
}
.project-folder summary {
  padding-left: 33px;
}
.empty-project {
  margin: 12px;
  background: none;
  border: 0;
  color: #3883bf;
  cursor: pointer;
}
.splitter {
  position: relative;
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: #fff;
  border-right: 1px solid #edf0f3;
}
.splitter::after {
  content: '';
  position: absolute;
  height: 32px;
  width: 2px;
  border-left: 1px solid #cdd1d6;
  border-right: 1px solid #e6e8eb;
  top: 65%;
}
.splitter:hover {
  background: #cbe7ff;
}
.editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.module-tabs {
  height: 34px;
  flex-shrink: 0;
  display: flex;
  background: #f7f7f7;
}
.module-tab {
  display: flex;
  max-width: 210px;
  height: 34px;
  border-right: 1px solid #d9dfe7;
}
.module-tab.active {
  background: white;
  border-bottom: 2px solid #409eff;
}
.module-tab button {
  border: 0;
  background: transparent;
  color: #3c536b;
  cursor: pointer;
}
.module-tab [role='tab'] {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 9px;
  font-size: 12px;
}
.module-tab .module-symbol {
  margin-right: 6px;
}
.close-tab {
  padding: 0 7px;
}
.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
  background: white;
}
.configuration-panel {
  flex-shrink: 0;
}
.parameter-panel {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: white;
}
.empty-editor {
  flex: 1;
  background: #f8f8f8;
}
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 13px;
  height: 38px;
  min-width: max-content;
  padding: 0 20px;
  background: linear-gradient(90deg, #d6e4f0, #f8fafc 85%);
  color: #61788d;
  font-size: 14px;
  border-radius: 3px 0 0 3px;
}
.crumb-arrow {
  color: #a6b6c5;
}
.crumb-parent {
  font-weight: 600;
}
.instance-name {
  height: 71px;
  margin: 0 22px;
  border-bottom: 1px solid #d8dee7;
  display: flex;
  align-items: center;
  gap: 52px;
  padding-left: 48px;
}
.instance-name label {
  flex-shrink: 0;
}
.instance-name .el-input {
  width: 270px;
}
.empty-children {
  margin: 8px 38px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.empty-children .el-button {
  margin: 0;
}
.utility-panel {
  position: absolute;
  z-index: 100;
  background: white;
  border: 1px solid #d9e1eb;
  box-shadow: 0 6px 20px #263d5626;
  border-radius: 3px;
}
.utility-heading {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: #f6f8fa;
  border-bottom: 1px solid #e4e7ed;
}
.utility-heading button {
  border: 0;
  background: none;
  color: #6c7d8d;
  font-size: 20px;
  cursor: pointer;
}
.config-library {
  left: 210px;
  top: 40px;
  max-width: 720px;
}
.validation-popup {
  right: 20px;
  top: 40px;
  width: 420px;
  max-height: calc(100vh - 60px);
  overflow: auto;
}
.instance-actions {
  top: 114px;
  width: 340px;
}
.floating-menu {
  position: fixed;
  z-index: 2100;
}
.project-menu {
  position: fixed;
  z-index: 2100;
  width: 180px;
  padding: 5px 0;
  background: #f4f4f4;
  border: 1px solid #dce0e5;
  border-radius: 5px;
  box-shadow: 0 6px 20px #0002;
}
.project-menu > span {
  display: block;
}
.project-menu button {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px 0 28px;
  border: 0;
  background: transparent;
  font-size: 14px;
  color: #414c57;
  cursor: pointer;
}
.project-menu button:hover:not(:disabled) {
  background: #ddebfa;
}
.project-menu button:disabled {
  color: #929ca5;
  cursor: not-allowed;
}
.project-menu hr {
  margin: 3px 0;
  border: 0;
  border-top: 1px solid #d7dce2;
}
.generated-code {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  background: #f5f7fa;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
