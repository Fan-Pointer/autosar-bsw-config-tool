<template>
  <div class="configurator-start">
    <header>
      <strong>OneSAR Configurator</strong>
      <RouterLink to="/" class="home-link" aria-label="返回主页面" title="返回主页面">
        <el-icon><HomeFilled /></el-icon><span>首页</span>
      </RouterLink>
    </header>
    <div class="start-layout">
      <aside aria-label="工程操作">
        <p>工程</p>
        <button
          :class="{ selected: panel === 'new' }"
          :aria-current="panel === 'new' ? 'page' : undefined"
          :disabled="opening || store.projectBusy"
          @click="selectPanel('new')"
        >
          <el-icon><Plus /></el-icon>新建工程
        </button>
        <button
          :class="{ selected: panel === 'import' }"
          :aria-current="panel === 'import' ? 'page' : undefined"
          :disabled="opening || store.projectBusy"
          @click="selectPanel('import')"
        >
          <el-icon><Upload /></el-icon>导入工程
        </button>
        <button
          :class="{ selected: panel === 'open' }"
          :aria-current="panel === 'open' ? 'page' : undefined"
          :disabled="opening || store.projectBusy"
          @click="selectPanel('open')"
        >
          <el-icon><FolderOpened /></el-icon>打开工程
        </button>
      </aside>
      <main>
        <RecoveryPanel />
        <p
          v-if="navigationError || store.projectError || store.error"
          role="alert"
          class="open-error"
        >
          {{ navigationError || store.projectError || store.error }}
        </p>
        <p v-if="opening" role="status">正在打开工程…</p>
        <ProjectWizard
          v-if="panel === 'new' && !store.dataSafety.locked"
          :model-value="true"
          inline
          @update:model-value="selectPanel('open')"
          @opened="created"
        />
        <template v-else-if="panel === 'import'">
          <h1>导入工程</h1>
          <p class="lead">选择 JSON 或 ARXML 配置文件，预览后导入到默认工程。已有工程保持不变。</p>
          <div class="import-formats">
            <button @click="openImport('json')">
              <el-icon><Document /></el-icon><strong>JSON 配置</strong
              ><span>恢复配置器导出的配置文件</span>
            </button>
            <button @click="openImport('arxml')">
              <el-icon><Document /></el-icon><strong>ARXML 配置</strong
              ><span>读取 AUTOSAR ECUC 参数值</span>
            </button>
          </div>
        </template>
        <template v-else-if="panel === 'open'">
          <h1>打开工程</h1>
          <p class="lead">选择本机保存的工程，继续配置。</p>
          <section class="recent-projects" aria-label="本机工程">
            <h2 v-if="store.projects.length">本机工程</h2>
            <button
              v-for="project in store.projects"
              :key="project.projectUuid"
              class="recent-row"
              :disabled="opening || store.isLoading"
              @click="openProject(project.projectUuid)"
            >
              <el-icon><FolderOpened /></el-icon
              ><span
                ><strong>{{ project.name }}</strong
                ><small
                  >CP {{ project.autosarVersion }} · {{ project.chip.family }} ·
                  {{ project.moduleShortNames.length }} 个模块</small
                ></span
              ><span aria-hidden="true">→</span>
            </button>
            <h2 v-if="store.unassignedSets.length" class="standalone-title">独立配置集</h2>
            <button
              v-for="set in store.unassignedSets"
              :key="set.uuid"
              class="recent-row"
              :disabled="opening || store.isLoading"
              @click="openSet(set.uuid)"
            >
              <el-icon><Document /></el-icon
              ><span
                ><strong>{{ set.name ?? set.moduleRef }}</strong
                ><small>{{ set.moduleRef }} · CP {{ set.version }}</small></span
              ><span aria-hidden="true">→</span>
            </button>
            <p v-if="!store.projects.length && !store.unassignedSets.length" class="empty">
              尚无本机工程
            </p>
          </section>
        </template>
      </main>
    </div>
    <ImportDialog
      v-if="showImport"
      v-model="showImport"
      :format="importFormat"
      new-only
      @imported="enterWorkspace"
    />
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Document, FolderOpened, HomeFilled, Plus, Upload } from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import ProjectWizard from '@/ui/Projects/ProjectWizard.vue';
import { useProjectNavigation } from '@/ui/Projects/useProjectNavigation';
import ImportDialog from '@/ui/ImportExport/ImportDialog.vue';
import RecoveryPanel from '@/ui/ConfigSets/RecoveryPanel.vue';
import type { ImportFormat } from '@/core/io/IoTypes';
const store = useConfigStore();
const { opening, navigationError, openProject, openSet, enterWorkspace } = useProjectNavigation();
const panel = ref<'new' | 'open' | 'import'>('new');
const showImport = ref(false),
  importFormat = ref<ImportFormat>('json');
onMounted(() => {
  void store.initialize();
});
function openImport(format: ImportFormat): void {
  importFormat.value = format;
  showImport.value = true;
}
function selectPanel(value: 'new' | 'open' | 'import'): void {
  panel.value = value;
  navigationError.value = '';
}
async function created(): Promise<void> {
  panel.value = 'open';
  await enterWorkspace();
}
</script>
<style scoped>
.configurator-start {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-text);
}
header {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 54px;
  flex-shrink: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
}
header strong {
  font-size: 18px;
}
.home-link {
  margin-left: auto;
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--color-text);
  text-decoration: none;
  font-size: 13px;
}
.start-layout {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
aside {
  overflow: auto;
  padding: 24px 12px;
  border-right: 1px solid var(--color-border);
  background: var(--color-panel);
}
aside p {
  padding: 0 14px;
  color: var(--color-muted);
  font-size: 12px;
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}
aside button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  margin: 5px 0;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 14px;
}
aside button.selected {
  color: var(--color-accent);
  background: var(--color-selected);
}
aside button:not(.selected):hover {
  color: var(--color-accent);
}
main {
  width: min(1080px, 100%);
  box-sizing: border-box;
  padding: 28px 32px;
  min-width: 0;
  overflow-y: auto;
}
.eyebrow {
  color: var(--color-accent);
  font-size: 11px;
  letter-spacing: 0.15em;
}
h1 {
  font-size: 26px;
  font-weight: 600;
  margin: 0 0 12px;
}
.lead {
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-muted);
}
.open-error {
  color: var(--color-error);
  font-size: 14px;
}
.standalone-title {
  margin-top: 28px;
}
h2 {
  font-size: 16px;
  font-weight: 600;
}
.recent-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px;
  margin: 8px 0;
  text-align: left;
}
.recent-row > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.recent-row strong,
.recent-row small {
  display: block;
  overflow-wrap: anywhere;
}
.recent-row strong {
  font-size: 14px;
  font-weight: 500;
}
.recent-row small {
  color: var(--color-muted);
  font-size: 12px;
  margin-top: 5px;
}
.empty {
  padding: 30px;
  color: var(--color-muted);
  border: 1px dashed var(--color-border);
  border-radius: 7px;
  text-align: center;
}
.import-formats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 28px;
}
.import-formats button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 22px;
  text-align: left;
}
.import-formats .el-icon {
  font-size: 24px;
  color: var(--color-accent);
}
.import-formats strong {
  font-size: 16px;
}
.import-formats span {
  color: var(--color-muted);
  font-size: 13px;
}
@media (max-width: 700px) {
  .start-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
  aside {
    display: flex;
    flex-wrap: wrap;
    padding: 10px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
  aside p {
    display: none;
  }
  aside button {
    width: auto;
  }
  main {
    padding: 24px;
  }
  .import-formats {
    grid-template-columns: 1fr;
  }
}
</style>
