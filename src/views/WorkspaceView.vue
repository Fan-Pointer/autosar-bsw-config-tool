<template>
  <div
    class="workspace-container"
    v-loading="store.isImporting"
    element-loading-text="正在应用导入…"
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
      <span class="brand-symbol">☷</span><span class="brand">OneSAR Configurator</span>
      <div class="toolbar-group">
        <button
          class="tool-button"
          aria-label="撤销"
          :disabled="!store.canUndo || store.isImporting"
          :title="store.canUndo ? '撤销：' + store.undoLabel : '无可撤销操作'"
          @click="store.undo()"
        >
          ↶
        </button>
        <button
          class="tool-button"
          aria-label="重做"
          :disabled="!store.canRedo || store.isImporting"
          :title="store.canRedo ? '重做：' + store.redoLabel : '无可重做操作'"
          @click="store.redo()"
        >
          ↷
        </button>
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
          @click="toggleValidation"
        >
          <el-icon><Search /></el-icon>
        </button>
        <button
          class="tool-button"
          title="返回主页面"
          aria-label="返回配置集列表"
          @click="router.push('/')"
        >
          <el-icon><HomeFilled /></el-icon><span class="sr-only">返回主页面</span>
        </button>
      </div>
      <span v-if="store.isDirty" class="dirty-indicator" title="配置有未保存修改">●</span>
      <GlobalSearch @navigate="navigateSearch" />
      <button
        class="theme-toggle"
        aria-label="切换主题"
        :title="theme === 'light' ? '切换到深色' : '切换到浅色'"
        @click="setTheme(theme === 'light' ? 'dark' : 'light')"
      >
        {{ theme === 'light' ? '深色' : '浅色' }}
      </button>
      <span class="language">简体中文⌄</span><span class="avatar">配</span>
    </header>
    <div class="project-strip">
      <strong>{{ store.activeProject?.name ?? '默认工程' }}</strong>
      <span v-if="store.activeProject"
        >CP {{ store.activeProject.autosarVersion }} · {{ store.activeProject.chip.family }}</span
      >
      <button @click="router.push('/')">工程列表</button
      ><button :disabled="store.dataSafety.locked" @click="showProjectWizard = true">
        ＋ 新建工程
      </button>
    </div>
    <ProjectWizard v-model="showProjectWizard" />
    <ProjectValidationDialog v-model="showAllValidation" :result="allValidation" />
    <ProjectSettingsDialog
      v-model="showSettings"
      :mode="settingsMode"
      :project="store.activeProject ?? undefined"
    />
    <RecoveryPanel />
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
    <main class="workspace-main">
      <aside
        class="project-panel"
        :style="{ width: projectWidth + 'px' }"
      >
        <div class="project-tree">
          <div
            class="project-root"
            tabindex="0"
            @contextmenu.prevent.stop="openProjectMenu"
            @keydown.shift.f10.prevent="openProjectMenu"
          >
            <span class="folder">▱</span
            ><span class="project-name">{{
              store.activeProject?.name ?? store.config?.name ?? '本机配置集'
            }}</span
            ><span>⌃</span>
          </div>
          <details open class="module-group">
              <summary><span class="folder">▱</span>BSW Modules</summary>
              <button
                v-for="item in includedModules"
                :key="moduleKey(item.shortName, item.version)"
                class="module-node"
                :class="{
                  selected:
                    activeOpen &&
                    store.module?.shortName === item.shortName &&
                    store.module?.version === item.version,
                }"
                @click="openModule(item.shortName, item.version)"
                @contextmenu.prevent.stop="openModuleMenu(item, $event)"
              >
                <span class="module-symbol">M</span>{{ item.shortName }}
              </button>
          </details>
          <details v-for="branch in fixedBranches" :key="branch.name" class="fixed-branch">
            <summary><span class="folder">▱</span>{{ branch.name }}</summary>
          </details>
          <button v-if="!store.config" class="empty-project" @click.stop="showSets = true">
            暂无配置集 · 点击创建
          </button>
        </div>
      </aside>
      <div
        class="splitter"
        role="separator"
        aria-label="配置集目录宽度"
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
              :title="tabTooltip(uuid)"
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
        <RequiredDefaultsAction v-if="activeOpen" />
        <div v-if="activeOpen" class="editor-body">
          <aside class="configuration-panel" :style="{ width: treeWidth + 'px' }">
            <ContainerNavigator
              :width="treeWidth"
              @actions="showActions = !showActions"
              @add-children="openAddChildren"
              @context="openContextMenu"
              @selected="
                showActions = false;
                contextMenu = undefined;
              "
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
              <span
                v-if="selectedContainerValid"
                class="crumb-ok"
                role="status"
                aria-label="容器校验通过"
                title="当前容器校验通过"
                >✓</span
              >
            </nav>
            <BatchEditPanel v-if="store.selectedContainerUuids.length > 1" />
            <template v-else-if="store.selectedEntry">
              <ChoiceSelector />
              <div
                v-if="store.childInstanceGroups.length"
                class="form-view-switch"
                role="tablist"
                aria-label="参数视图"
              >
                <button
                  role="tab"
                  :aria-selected="paramView === 'form'"
                  :class="{ active: paramView === 'form' }"
                  @click="paramView = 'form'"
                >
                  表单
                </button>
                <button
                  role="tab"
                  :aria-selected="paramView === 'list'"
                  :class="{ active: paramView === 'list' }"
                  @click="paramView = 'list'"
                >
                  列表
                </button>
              </div>
              <InstanceListView
                v-if="paramView === 'list' && store.childInstanceGroups.length"
                :groups="store.childInstanceGroups"
                @open="store.selectContainer"
                @batch-edit="batchFromList"
              />
              <DynamicForm
                v-show="paramView === 'form'"
                :key="store.selectedEntry.container.uuid"
                :container="store.selectedEntry.definition"
                :config-data="store.parameterData"
                :reference-data="store.referenceData"
                :reference-options="store.referenceOptions"
                :reference-add-options="store.referenceAddOptions"
                :dangling-references="store.danglingReferences"
                :selected-field-uuid="helpFieldUuid ?? store.selectedFieldUuid"
                :configured-fields="configuredFields"
                :parameter-states="store.parameterStates"
                :reference-targets="store.referenceTargetsByRef"
                :field-errors="selectedFieldErrors"
                :readonly="store.isImporting || store.isLoading"
                @parameter-change="store.setParameterValue"
                @parameter-row-add="store.addParameterValueRow"
                @parameter-row-remove="store.removeParameterValueRow"
                @reference-change="store.setReferenceTarget"
                @reference-add="store.addReferenceTarget"
                @reference-remove="store.removeReferenceTarget"
                @create-reference-target="store.createReferenceTarget"
                @field-help="showFieldHelp"
              />
              <ReferenceRelations @navigate="navigateRelation" />
              <details
                v-if="
                  !store.selectedEntry.definition.choice &&
                  !store.selectedEntry.container.subContainers.length &&
                  store.childOptions.length
                "
                class="empty-children"
              >
                <summary>＋ 添加子容器</summary>
                <div class="child-shortcuts">
                  <el-button
                    v-for="option in store.childOptions"
                    :key="option.definition.uuid"
                    size="small"
                    text
                    :disabled="Boolean(option.disabledReason)"
                    :title="option.disabledReason"
                    @click="addFirst(option.definition.uuid)"
                    >＋
                    {{
                      option.definition.initialAddLabel ?? '添加 ' + option.definition.shortName
                    }}</el-button
                  >
                </div>
              </details>
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
    <section v-show="showValidation" class="validation-dock" aria-label="编辑器信息" @click.stop>
      <nav class="dock-tabs" role="tablist" aria-label="底部信息">
        <button role="tab" :aria-selected="dockTab === 'help'" @click="dockTab = 'help'">
          参数说明
        </button>
        <button role="tab" :aria-selected="dockTab === 'issues'" @click="dockTab = 'issues'">
          问题（{{ store.violations.length + (outputError ? 1 : 0) }}）
        </button>
      </nav>
      <FieldDescriptionPanel
        v-show="dockTab === 'help'"
        :field="helpField"
        :path="helpPath"
        class="dock-content"
        @collapse="showValidation = false"
      />
      <div v-show="dockTab === 'issues'" class="dock-content" role="region" aria-label="问题面板">
        <ValidationPanel
          :violations="store.violations"
          :validated="store.validated"
          :operation-error="outputError"
          @validate="validate"
          @navigate="navigateViolation"
          @collapse="showValidation = false"
        />
      </div>
    </section>
    <section
      v-show="showActions && activeOpen"
      class="utility-panel instance-actions"
      :style="{ left: projectWidth + treeWidth + 'px' }"
      @click.stop
    >
      <ContainerActions
        v-if="store.config"
        ref="actionsPanel"
        @navigate="navigateViolation"
        @opening="contextMenu = undefined"
      />
    </section>
    <ContainerContextMenu
      v-if="contextMenu"
      :key="store.activeUuid"
      v-bind="contextMenu"
      @close="contextMenu = undefined"
    />
    <div
      v-if="projectMenu"
      ref="projectMenuPanel"
      class="project-menu"
      role="menu"
      :style="{ left: projectMenu.x + 'px', top: projectMenu.y + 'px' }"
      @click.stop
    >
      <template v-for="(item, index) in menuItems" :key="index">
        <hr v-if="item.separator" />
        <span v-else class="project-menu-entry"
          ><button
            role="menuitem"
            :disabled="item.action === 'export' && !store.config"
            :aria-expanded="
              item.action === 'import' || item.action === 'export' || Boolean(item.children)
                ? projectSubmenu === item.action
                : undefined
            "
            @click="projectAction(item.action)"
          >
            <span>{{ item.label }}</span
            >
          </button>
          <div
            v-if="projectSubmenu === item.action && item.children"
            class="io-submenu"
            role="menu"
          >
            <button
              v-for="child in item.children"
              :key="child.action"
              role="menuitem"
              @click="projectAction(child.action)"
            >
              {{ child.label }}
            </button>
          </div>
          <div
            v-if="
              projectSubmenu === item.action &&
              (item.action === 'import' || item.action === 'export')
            "
            class="io-submenu"
            role="menu"
          >
            <button
              v-for="format in item.action === 'import' ? importFormats : exportFormats"
              :key="format"
              role="menuitem"
              @click="ioAction(item.action, format)"
            >
              {{ format === 'csv' ? 'CSV（DTC 列表）' : format.toUpperCase() }}
            </button>
            <template v-if="item.action === 'export'">
              <button role="menuitem" @click="projectAction('export-project-arxml')">
                工程 ARXML（全部模块）
              </button>
              <button role="menuitem" @click="projectAction('export-project-package')">
                工程包（ZIP：ARXML+C）
              </button>
            </template>
          </div>
        </span>
      </template>
    </div>
    <div
      v-if="moduleMenu"
      ref="moduleMenuPanel"
      class="project-menu module-menu"
      role="menu"
      :aria-label="moduleMenu.shortName + ' 模块菜单'"
      :style="{ left: moduleMenu.x + 'px', top: moduleMenu.y + 'px' }"
      @click.stop
    >
      <button role="menuitem" @click="moduleAction('validate')">
        <span>模块校验</span>
      </button>
      <button role="menuitem" @click="moduleAction('generate')">
        <span>代码生成</span>
      </button>
      <button role="menuitem" @click="moduleAction('import')">
        <span>导入（模块 ARXML）</span>
      </button>
      <button role="menuitem" @click="moduleAction('export')">
        <span>导出（模块 ARXML）</span>
      </button>
    </div>
    <ModuleManager v-model="showModules" @applied="reconcileModules" />
    <ImportDialog v-model="showImport" :format="importFormat" @imported="reopenImported" />
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
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  HomeFilled,
  CircleCheck,
  DocumentChecked,
  FolderOpened,
  Search,
  SetUp,
  VideoPlay,
} from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import { moduleKey } from '@/core/bswmd/ModuleKey';
import { CGenerator } from '@/core/generator/CGenerator';
import type { GeneratedFile } from '@/core/generator/TemplateEngine';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import { OutputValidationError } from '@/core/output/OutputGate';
import DynamicForm from '@/ui/FormEditor/DynamicForm.vue';
import InstanceListView from '@/ui/FormEditor/InstanceListView.vue';
import FieldDescriptionPanel from '@/ui/FormEditor/FieldDescriptionPanel.vue';
import ContainerNavigator from '@/ui/ConfigTree/ContainerNavigator.vue';
import ValidationPanel from '@/ui/Validator/ValidationPanel.vue';
import ConfigSetManager from '@/ui/ConfigSets/ConfigSetManager.vue';
import ProjectWizard from '@/ui/Projects/ProjectWizard.vue';
import ProjectSettingsDialog from '@/ui/Projects/ProjectSettingsDialog.vue';
import ProjectValidationDialog from '@/ui/Projects/ProjectValidationDialog.vue';
import RecoveryPanel from '@/ui/ConfigSets/RecoveryPanel.vue';
import ContainerActions from '@/ui/ConfigTree/ContainerActions.vue';
import ContainerContextMenu from '@/ui/ConfigTree/ContainerContextMenu.vue';
import {
  placeContainerMenu,
  type ContainerContextTarget,
} from '@/ui/ConfigTree/containerMenuPosition';
import ModuleManager from '@/ui/Modules/ModuleManager.vue';
import ImportDialog from '@/ui/ImportExport/ImportDialog.vue';
import type { ExportFormat, ImportFormat } from '@/core/io/IoTypes';
import { useHistory } from '@/ui/History/useHistory';
import BatchEditPanel from '@/ui/BatchEdit/BatchEditPanel.vue';
import ChoiceSelector from '@/ui/FormEditor/ChoiceSelector.vue';
import ReferenceRelations from '@/ui/FormEditor/ReferenceRelations.vue';
import RequiredDefaultsAction from '@/ui/FormEditor/RequiredDefaultsAction.vue';
import GlobalSearch from '@/ui/Search/GlobalSearch.vue';
import type { SearchResult } from '@/core/search/ConfigSearch';
import { theme, setTheme } from '@/ui/Theme/theme';
import { readScene, writeScene } from '@/ui/WorkspaceScene';
const router = useRouter(),
  store = useConfigStore();
useHistory();
const generatedFiles = ref<GeneratedFile[]>([]),
  showGenerated = ref(false);
const showProjectWizard = ref(false);
const showSettings = ref(false);
const showAllValidation = ref(false);
const allValidation = ref<ReturnType<typeof store.validateAllProjects>>([]);
const settingsMode = ref<'edit' | 'detail'>('edit');
const showSets = ref(false),
  showModules = ref(false),
  showValidation = ref(false),
  showActions = ref(false);
const opened = ref<string[]>([]);
const actionsPanel = ref<InstanceType<typeof ContainerActions>>();
async function openAddChildren(): Promise<void> {
  contextMenu.value = undefined;
  showActions.value = false;
  await nextTick();
  actionsPanel.value?.openAdd();
}
const outputError = ref('');
const dockTab = ref<'help' | 'issues'>('issues');
const helpFieldUuid = ref<string>();
const helpField = computed(() => {
  const definition = store.selectedEntry?.definition;
  return (
    definition?.parameters.find((field) => field.uuid === helpFieldUuid.value) ??
    definition?.references.find((field) => field.uuid === helpFieldUuid.value)
  );
});
const helpPath = computed(() => {
  const definition = store.selectedEntry?.definition;
  return `${definition?.definitionPath ?? definition?.shortName ?? ''}/${helpField.value?.shortName ?? ''}`;
});
const paramView = ref<'form' | 'list'>('form');
function batchFromList(uuids: string[]): void {
  if (!uuids.length) return;
  store.selectedContainerUuids = uuids;
}
function showFieldHelp(uuid: string): void {
  helpFieldUuid.value = uuid;
  dockTab.value = 'help';
  showValidation.value = true;
}
function toggleValidation(): void {
  showValidation.value = !(showValidation.value && dockTab.value === 'issues');
  dockTab.value = 'issues';
}
/** G43/FR-26: green check when the current container has no ERROR in the last validation. */
const selectedContainerValid = computed(() =>
  Boolean(
    store.validated &&
      store.selectedEntry &&
      !store.violations.some(
        (item) =>
          item.severity === 'ERROR' &&
          item.containerUuid === store.selectedEntry!.container.uuid
      )
  )
);
const configuredFields = computed(() =>
  Object.fromEntries([
    ...[...(store.selectedEntry?.container.parameters.values() ?? [])].map((value) => [
      value.definitionRef,
      value.isConfigured,
    ]),
    ...[...(store.selectedEntry?.container.references.values() ?? [])].map((value) => [
      value.definitionRef,
      value.isConfigured,
    ]),
  ])
);
const selectedFieldErrors = computed(() =>
  Object.fromEntries(
    store.violations
      .filter(
        (issue) =>
          issue.severity === 'ERROR' &&
          issue.containerUuid === store.selectedEntry?.container.uuid &&
          issue.definitionRef
      )
      .map((issue) => [issue.definitionRef!, issue.message])
  )
);
const contextMenu = ref<{
    x: number;
    y: number;
    target: ContainerContextTarget;
    returnFocus?: HTMLElement;
  }>(),
  projectMenu = ref<{ x: number; y: number }>();
const projectMenuPanel = ref<HTMLElement>();
const projectWidth = ref(212),
  treeWidth = ref(240);
const showImport = ref(false),
  importFormat = ref<ImportFormat>('json');
const projectSubmenu = ref<string>();
const importFormats: ImportFormat[] = ['json', 'arxml'];
const exportFormats: ExportFormat[] = ['json', 'arxml', 'csv'];
const activeOpen = computed(() =>
  Boolean(store.activeUuid && opened.value.includes(store.activeUuid))
);
// A selected field is view state, never a parameter edit or a persisted setting.
watch(
  () => [store.activeUuid, store.selectedEntry?.container.uuid, activeOpen.value],
  () => {
    helpFieldUuid.value = undefined;
  }
);
/** Four fixed tree branches (G41). They are entry points: each states its real status
 * instead of pretending to hold data. */
/** 与 BSW Modules 同级的三条占位分支（用户裁定：展开为空白，不再写说明）。 */
const fixedBranches = [{ name: 'RTE' }, { name: '输入文件' }, { name: '输出文件' }] as const;
const includedModules = computed(() => {
  const project = store.activeProject;
  if (project)
    return store.modules.filter(
      (item) =>
        item.version === project.autosarVersion &&
        project.moduleShortNames.includes(item.shortName)
    );
  // 没有工程时只列出「已有配置集」的模块：避免把定义库里的模块全堆到左栏。
  const configured = new Set(store.configSets.map((set) => set.moduleRef));
  return store.modules.filter((item) => configured.has(item.shortName));
});
const breadcrumb = computed(() => {
  const entry = store.selectedEntry;
  if (!entry) return [];
  const path = entry.path.split('/');
  if (path.length === 1) path.unshift(entry.definition.shortName);
  return path;
});
const menuItems = [
  { label: '新建工程', action: 'new-project' },
  { separator: true },
  {
    label: '工程管理',
    submenu: true,
    action: 'project-manage',
    children: [
      { label: '编辑工程', action: 'edit-project' },
      { label: '复制工程', action: 'duplicate-project' },
      { label: '工程详情', action: 'project-detail' },
    ],
  },
  { label: '模块管理', submenu: true, action: 'modules' },
  { label: '代码验证', action: 'validate' },
  { label: '验证所有工程', action: 'validate-all' },
  { label: '代码生成', action: 'generate' },
  { label: '导入', submenu: true, action: 'import' },
  { label: '导出', submenu: true, action: 'export' },
  { separator: true },
  { label: '关闭配置集', action: 'close' },
  { label: '关闭所有工程', action: 'close-all' },
];
watch(
  () => [
    store.activeUuid,
    store.activeProject?.projectUuid,
    store.activeProject?.setUuids.join('|'),
  ],
  () => {
    const uuid = store.activeUuid;
    outputError.value = '';
    contextMenu.value = undefined;
    showGenerated.value = false;
    opened.value = opened.value.filter(
      (id) =>
        store.configSets.some((set) => set.uuid === id) &&
        (!store.activeProject || store.activeProject.setUuids.includes(id))
    );
    if (
      uuid &&
      store.module &&
      store.getModulePreference(store.module.shortName, store.module.version).included &&
      !opened.value.includes(uuid)
    )
      opened.value.push(uuid);
  },
  { immediate: true }
);
watch([showSets, showModules, showImport, showGenerated, () => store.isImporting], () => {
  contextMenu.value = undefined;
});
onMounted(async () => {
  await store.initialize();
  await restoreScene();
  window.addEventListener('beforeunload', warnUnsaved);
  // Context menus close on any outside click (menu panels stop propagation themselves).
  document.addEventListener('click', closeContextMenus);
  document.addEventListener('contextmenu', closeContextMenus);
});
/** G43: restore tabs and selection from this tab's previous session (sessionStorage). */
async function restoreScene(): Promise<void> {
  const known = store.configSets.map((set) => set.uuid);
  const scene = readScene(window.sessionStorage, known);
  if (!scene) return;
  try {
    if (scene.activeUuid && scene.activeUuid !== store.activeUuid) {
      if (!(await store.switchConfigSet(scene.activeUuid).catch(() => false))) return;
    }
    if (scene.opened.length) opened.value = scene.opened;
    if (scene.containerUuid) store.selectContainer(scene.containerUuid, scene.fieldUuid);
  } catch {
    // 失效的现场不阻断编辑：直接忽略，保留正常初始状态。
  }
}
watch(
  () => [
    opened.value.join('|'),
    store.activeUuid,
    store.selectedEntry?.container.uuid,
    store.selectedFieldUuid,
  ],
  () => {
    writeScene(window.sessionStorage, {
      opened: opened.value,
      activeUuid: store.activeUuid,
      containerUuid: store.selectedEntry?.container.uuid,
      fieldUuid: store.selectedFieldUuid,
    });
  }
);
onUnmounted(() => {
  window.removeEventListener('beforeunload', warnUnsaved);
  document.removeEventListener('click', closeContextMenus);
  document.removeEventListener('contextmenu', closeContextMenus);
  stopResize();
});
onBeforeRouteLeave(() => !store.isDirty || store.saveConfig().catch(() => false));
function warnUnsaved(event: BeforeUnloadEvent): void {
  if (store.isDirty) {
    event.preventDefault();
    event.returnValue = '';
  }
}
/** Dismiss every floating context menu; used for outside-click closing. */
function closeContextMenus(event: Event): void {
  const insideMenu =
    event.target instanceof Element &&
    Boolean(event.target.closest('.project-menu, .io-submenu, .container-context-menu'));
  if (insideMenu) return;
  projectMenu.value = undefined;
  moduleMenu.value = undefined;
}
function operationEnabled(operation: 'generation' | 'validation'): boolean {
  return Boolean(
    store.config &&
    store.module &&
    store.getModulePreference(store.module.shortName, store.module.version)[operation]
  );
}
function tabLabel(uuid: string): string {
  const set = store.configSets.find((item) => item.uuid === uuid);
  return set ? set.moduleRef : '';
}
function tabTooltip(uuid: string): string {
  const set = store.configSets.find((item) => item.uuid === uuid);
  return set
    ? `模块：${set.moduleRef} · CP ${set.version}\n配置集：${set.name ?? set.moduleRef}`
    : '';
}
function reopenImported(): void {
  if (store.activeUuid && !opened.value.includes(store.activeUuid))
    opened.value.push(store.activeUuid);
}
/** 统一下载入口：立即 revoke，避免大文件长期占内存。 */
function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function ioAction(action: string, format: ExportFormat): void {
  projectMenu.value = undefined;
  moduleMenu.value = undefined;
  if (action === 'import' && format !== 'csv') {
    importFormat.value = format;
    showImport.value = true;
    return;
  }
  try {
    outputError.value = '';
    const content = store.exportConfig(format);
    const mime =
      format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'application/xml';
    const url = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(store.config?.name ?? 'configuration').replace(/[\\/:*?"<>|]/g, '_')}.${format}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (reason) {
    showOutputFailure(reason);
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
async function openModule(name: string, release: string): Promise<void> {
  const existing = store.configSets.find(
    (item) =>
      item.moduleRef === name &&
      item.version === release &&
      (store.activeProject
        ? store.activeProject.setUuids.includes(item.uuid)
        : store.unassignedSets.some((set) => set.uuid === item.uuid))
  );
  if (existing) {
    if (!(await store.switchConfigSet(existing.uuid).catch(() => false))) return;
  } else if (!(await store.createConfigSet(name + ' 配置', name, release).catch(() => false)))
    return;
  if (store.activeUuid && !opened.value.includes(store.activeUuid))
    opened.value.push(store.activeUuid);
}
async function closeTab(uuid: string): Promise<void> {
  if (store.isDirty && !(await store.saveConfig().catch(() => false))) return;
  opened.value = opened.value.filter((id) => id !== uuid);
  if (store.activeUuid === uuid && opened.value.length)
    await store.switchConfigSet(opened.value[opened.value.length - 1]).catch(() => false);
}
function reconcileModules(): void {
  opened.value = opened.value.filter((id) => {
    const set = store.configSets.find((item) => item.uuid === id);
    return (
      set &&
      (store.activeProject
        ? store.activeProject.setUuids.includes(id)
        : store.getModulePreference(set.moduleRef, set.version).included)
    );
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
/** 打开任一新菜单前先关掉所有旧菜单，避免两个菜单重叠。 */
function closeAllMenus(): void {
  showActions.value = false;
  projectMenu.value = undefined;
  contextMenu.value = undefined;
  moduleMenu.value = undefined;
  projectSubmenu.value = undefined;
}
function openContextMenu(event: MouseEvent, target: ContainerContextTarget): void {
  closeAllMenus();
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    target,
    returnFocus:
      event.target instanceof Element
        ? (event.target.closest<HTMLElement>('[role="treeitem"]') ?? undefined)
        : undefined,
  };
}
const moduleMenu = ref<{
  x: number;
  y: number;
  shortName: string;
  version: string;
}>();
const moduleMenuPanel = ref<HTMLElement>();
/** Module-node context menu: open near the cursor and clamp into the viewport. */
async function openModuleMenu(
  item: { shortName: string; version: string },
  event: MouseEvent
): Promise<void> {
  closeAllMenus();
  const anchor = { x: event.clientX, y: event.clientY };
  moduleMenu.value = { ...anchor, shortName: item.shortName, version: item.version };
  await nextTick();
  if (moduleMenuPanel.value && moduleMenu.value) {
    const placed = placeContainerMenu(anchor, moduleMenuPanel.value.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    moduleMenu.value = { ...moduleMenu.value, x: placed.left, y: placed.top };
  }
}
/** Module context actions: each opens the module first, then runs the operation on it. */
async function moduleAction(action?: string): Promise<void> {
  const menu = moduleMenu.value;
  moduleMenu.value = undefined;
  if (!menu) return;
  await openModule(menu.shortName, menu.version);
  if (action === 'validate') validate();
  if (action === 'generate') await generateCode();
  if (action === 'import') {
    importFormat.value = 'arxml';
    showImport.value = true;
  }
  if (action === 'export') ioAction('export', 'arxml');
}
async function openProjectMenu(event: MouseEvent | KeyboardEvent): Promise<void> {
  closeAllMenus();
  const anchor = {
    x: 'clientX' in event ? event.clientX : 160,
    y: 'clientY' in event ? event.clientY : 80,
  };
  projectMenu.value = anchor;
  await nextTick();
  if (projectMenuPanel.value && projectMenu.value) {
    const placed = placeContainerMenu(anchor, projectMenuPanel.value.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    projectMenu.value = { x: placed.left, y: placed.top };
  }
}
async function projectAction(action?: string): Promise<void> {
  if (action === 'import' || action === 'export' || action === 'project-manage') {
    projectSubmenu.value = projectSubmenu.value === action ? undefined : action;
    return;
  }
  projectMenu.value = undefined;
  if (action === 'new-project') showProjectWizard.value = true;
  if (action === 'edit-project' || action === 'project-detail') {
    if (!store.activeProject) {
      ElMessage.warning('请先打开工程');
      return;
    }
    settingsMode.value = action === 'edit-project' ? 'edit' : 'detail';
    showSettings.value = true;
  }
  if (action === 'duplicate-project') {
    if (!store.activeProject) {
      ElMessage.warning('请先打开工程');
      return;
    }
    const project = store.activeProject;
    try {
      await ElMessageBox.confirm(
        `将连同配置数据一起复制为「${project.name} 副本」，是否继续？`,
        '复制工程',
        { type: 'info', confirmButtonText: '复制', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
    try {
      await store.duplicateProject(project.projectUuid);
      ElMessage.success(`已复制为「${project.name} 副本」`);
    } catch (reason) {
      ElMessage.error(reason instanceof Error ? reason.message : String(reason));
    }
  }
  if (action === 'export-project-arxml' || action === 'export-project-package') {
    const base = (store.activeProject?.name ?? store.config?.name ?? '工程').replace(
      /[\\/:*?"<>|]/g,
      '_'
    );
    try {
      outputError.value = '';
      if (action === 'export-project-arxml') {
        downloadBlob(`${base}.arxml`, new Blob([store.exportProjectArxmlContent()], { type: 'application/xml;charset=utf-8' }));
        ElMessage.success('工程 ARXML 已导出');
      } else {
        const { zip, manifest } = await store.exportProjectPackageContent();
        const bytes = new Uint8Array(zip);
        downloadBlob(`${base}.zip`, new Blob([bytes], { type: 'application/zip' }));
        ElMessage.success(
          `工程包已导出：${manifest.modules.length} 个模块` +
            (manifest.skipped.length ? `，${manifest.skipped.length} 个模块跳过 C 生成` : '')
        );
      }
    } catch (reason) {
      showOutputFailure(reason);
    }
    return;
  }
  if (action === 'modules') showModules.value = true;
  if (action === 'validate' && operationEnabled('validation')) validate();
  if (action === 'validate-all') {
    allValidation.value = store.validateAllProjects();
    showAllValidation.value = true;
  }
  if (action === 'close-all') {
    if (store.isDirty && !(await store.saveConfig().catch(() => false))) return;
    store.closeAllProjects();
    opened.value = [];
    ElMessage.success('已关闭所有工程，配置数据仍保留在库中');
  }
  if (action === 'generate' && operationEnabled('generation')) await generateCode();
  if (action === 'close' && (!store.isDirty || (await store.saveConfig().catch(() => false))))
    opened.value = [];
}
function validate(): void {
  dockTab.value = 'issues';
  outputError.value = '';
  store.validate();
  showValidation.value = true;
}
async function focusField(uuid?: string): Promise<void> {
  if (!uuid) return;
  await nextTick();
  const field = document.getElementById('field-' + uuid);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  (
    document.getElementById('input-' + uuid) ??
    field?.querySelector<HTMLElement>('input, button, [tabindex]')
  )?.focus();
}
function navigateViolation(violation: ConstraintViolation): void {
  helpFieldUuid.value = undefined;
  dockTab.value = 'issues';
  if (!violation.containerUuid) return;
  if (store.activeUuid && !opened.value.includes(store.activeUuid))
    opened.value.push(store.activeUuid);
  store.selectContainer(violation.containerUuid, violation.definitionRef);
  void focusField(violation.definitionRef);
}
function navigateRelation(uuid: string, fieldUuid?: string): void {
  store.selectContainer(uuid, fieldUuid);
  void focusField(fieldUuid);
}
function showOutputFailure(reason: unknown): void {
  dockTab.value = 'issues';
  // Validation has already populated the shared issue list; operational failures are shown separately.
  outputError.value =
    reason instanceof OutputValidationError
      ? ''
      : reason instanceof Error
        ? reason.message
        : String(reason);
  showValidation.value = true;
}
function navigateSearch(result: SearchResult): void {
  reopenImported();
  void focusField(result.fieldUuid);
}
async function saveConfig(): Promise<void> {
  if (await store.saveConfig().catch(() => false)) {
    if (store.dataSafety.locked) ElMessage.info('独立草稿写入完成；原配置库仍锁定');
    else ElMessage.success('已保存到本机');
  }
}
async function generateCode(): Promise<void> {
  if (!store.config || !store.module) return;
  outputError.value = '';
  const check = store.getOutputCheck();
  store.validate(check);
  if (!check.ready) {
    dockTab.value = 'issues';
    ElMessage.warning('请先修复验证错误');
    showValidation.value = true;
    return;
  }
  try {
    const generator = new CGenerator();
    generatedFiles.value = await Promise.all([
      generator.generateHeader(store.config, store.module, check),
      generator.generateSource(store.config, store.module, check),
    ]);
    showGenerated.value = true;
  } catch (reason) {
    showOutputFailure(reason);
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
.project-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 36px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
  font-size: 12px;
}
.project-strip strong {
  color: var(--color-text);
}
.project-strip span {
  color: var(--color-muted);
}
.project-strip button {
  background: transparent;
  border: 0;
  color: var(--color-accent);
  cursor: pointer;
  font: inherit;
}
.project-strip button:first-of-type {
  margin-left: auto;
}
.workspace-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-panel);
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
  background: var(--color-panel);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}
.brand-symbol {
  font-size: 15px;
  color: var(--color-muted);
}
.brand {
  color: var(--color-text);
  font-size: 14px;
  white-space: nowrap;
  margin-right: 3px;
}
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 3px;
  border-right: 1px solid var(--color-border);
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
  color: var(--color-muted);
  cursor: pointer;
  font-size: 17px;
}
.tool-button:hover {
  background: var(--color-selected);
}
.tool-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.green {
  color: var(--color-success);
}
.amber {
  color: var(--color-warning);
}
.toolbar-spacer {
  flex: 1;
}
.theme-toggle {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 4px;
}
.dirty-indicator {
  color: var(--color-warning);
  font-size: 10px;
}
.language {
  color: var(--color-muted);
  font-size: 13px;
}
.avatar {
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
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
  background: var(--color-panel);
  overflow: hidden;
}
.project-heading {
  height: 31px;
  margin: 0 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
}
.project-heading button {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--color-muted);
  font-size: 23px;
  cursor: pointer;
}
.project-tree {
  overflow: auto;
  height: 100%;
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
  color: var(--color-warning);
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
  color: var(--color-muted);
  font-size: 11px;
}
.project-tree details:not([open]) > summary::after {
  content: '⌄';
}
.module-group > summary,
.fixed-branch > summary {
  padding-left: 32px;
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
  color: var(--color-text);
  cursor: pointer;
  font-size: 14px;
}
.module-node.selected {
  background: var(--color-selected);
  color: var(--color-accent);
}
.module-symbol {
  display: inline-block;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--color-warning);
  color: var(--color-on-accent);
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
  color: var(--color-accent);
  cursor: pointer;
}
.splitter {
  position: relative;
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}
.splitter::after {
  content: '';
  position: absolute;
  height: 32px;
  width: 2px;
  border-left: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  top: 65%;
}
.splitter:hover {
  background: var(--color-selected);
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
  background: var(--color-panel);
}
.module-tab {
  display: flex;
  max-width: 210px;
  height: 34px;
  border-right: 1px solid var(--color-border);
}
.module-tab.active {
  background: var(--color-surface);
  border-bottom: 2px solid var(--color-accent);
}
.module-tab button {
  border: 0;
  background: transparent;
  color: var(--color-text);
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
  background: var(--color-surface);
}
.configuration-panel {
  flex-shrink: 0;
}
.parameter-panel {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: var(--color-surface);
}
.empty-editor {
  flex: 1;
  background: var(--color-panel);
}
.fixed-branch > summary,
.module-group > summary {
  cursor: pointer;
}
.crumb-ok {
  margin-left: 6px;
  color: var(--color-success);
  font-weight: 700;
}
.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 13px;
  height: 38px;
  min-width: max-content;
  padding: 0 20px;
  background: linear-gradient(90deg, var(--color-selected), var(--color-panel) 85%);
  color: var(--color-muted);
  font-size: 14px;
  border-radius: 3px 0 0 3px;
}
.crumb-arrow {
  color: var(--color-muted);
}
.crumb-parent {
  font-weight: 600;
}
.form-view-switch {
  display: flex;
  gap: 4px;
  margin: 8px 22px 0;
}
.form-view-switch button {
  border: 1px solid var(--color-border);
  background: var(--color-panel);
  color: var(--color-muted);
  font: inherit;
  font-size: 13px;
  padding: 4px 14px;
  cursor: pointer;
}
.form-view-switch button.active {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: var(--color-selected);
}
.empty-children {
  margin: 24px 38px 32px;
  border-top: 1px solid var(--color-border);
  padding-top: 18px;
  color: var(--color-muted);
  font-size: 13px;
}
.empty-children summary {
  cursor: pointer;
}
.child-shortcuts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
}
.empty-children .el-button {
  margin: 0;
}
.utility-panel {
  position: absolute;
  z-index: 100;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 6px 20px var(--color-shadow);
  border-radius: 3px;
}
.utility-heading {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: var(--color-panel);
  border-bottom: 1px solid var(--color-border);
}
.utility-heading button {
  border: 0;
  background: none;
  color: var(--color-muted);
  font-size: 20px;
  cursor: pointer;
}
.config-library {
  left: 210px;
  top: 40px;
  max-width: 720px;
}
.validation-dock {
  display: flex;
  flex-direction: column;
  height: min(260px, 34vh);
  min-height: 120px;
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  overflow: hidden;
}
.dock-tabs {
  display: flex;
  flex-shrink: 0;
  gap: 16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
}
.dock-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 7px 0;
  color: var(--color-muted);
  background: transparent;
  cursor: pointer;
}
.dock-tabs button[aria-selected='true'] {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
.dock-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  box-shadow: 0 6px 20px var(--color-shadow);
}
.project-menu > span {
  display: block;
}
.project-menu-entry {
  position: relative;
}
.io-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  width: 180px;
  padding: 5px 0;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: 5px;
  box-shadow: 0 6px 20px var(--color-shadow);
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
  color: var(--color-text);
  cursor: pointer;
}
.project-menu button:hover:not(:disabled) {
  background: var(--color-selected);
}
.project-menu button:disabled {
  color: var(--color-muted);
  cursor: not-allowed;
}
.project-menu hr {
  margin: 3px 0;
  border: 0;
  border-top: 1px solid var(--color-border);
}
.generated-code {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  background: var(--color-panel);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
