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
        <button :disabled="store.isLoading || store.dataSafety.locked" @click="showCreate = true">
          <el-icon><Plus /></el-icon>新建工程
        </button>
        <button :class="{ selected: panel === 'import' }" @click="panel = 'import'">
          <el-icon><Upload /></el-icon>导入工程
        </button>
        <button :class="{ selected: panel === 'open' }" @click="panel = 'open'">
          <el-icon><FolderOpened /></el-icon>打开工程
        </button>
      </aside>
      <main>
        <RecoveryPanel />
        <template v-if="panel === 'import'">
          <p class="eyebrow">IMPORT</p>
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
        <template v-else>
          <p class="eyebrow">WORKSPACE</p>
          <h1>{{ panel === 'open' ? '打开本机工程' : '从一个工程开始' }}</h1>
          <p class="lead">新建工程、导入已有配置，或从下方选择要继续的工程。</p>
          <div class="start-actions">
            <button
              class="primary"
              :disabled="store.isLoading || store.dataSafety.locked"
              @click="showCreate = true"
            >
              新建工程</button
            ><button @click="panel = 'import'">导入工程</button>
          </div>
          <p v-if="store.projectError || store.error" role="alert">
            {{ store.projectError || store.error }}
          </p>
          <section class="recent-projects" aria-label="本机工程">
            <h2>本机工程</h2>
            <button
              v-for="project in store.projects"
              :key="project.projectUuid"
              class="recent-row"
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
            <button
              v-for="set in store.unassignedSets"
              :key="set.uuid"
              class="recent-row"
              @click="openSet(set.uuid)"
            >
              <el-icon><Document /></el-icon
              ><span
                ><strong>{{ set.name ?? set.moduleRef }}</strong
                ><small>默认工程 · {{ set.moduleRef }} · CP {{ set.version }}</small></span
              ><span aria-hidden="true">→</span>
            </button>
            <p v-if="!store.projects.length && !store.unassignedSets.length" class="empty">
              尚无本机工程
            </p>
          </section>
        </template>
      </main>
    </div>
    <ProjectWizard v-model="showCreate" @opened="router.push('/workspace')" />
    <ImportDialog
      v-if="showImport"
      v-model="showImport"
      :format="importFormat"
      new-only
      @imported="router.push('/workspace')"
    />
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Document, FolderOpened, HomeFilled, Plus, Upload } from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import ProjectWizard from '@/ui/Projects/ProjectWizard.vue';
import ImportDialog from '@/ui/ImportExport/ImportDialog.vue';
import RecoveryPanel from '@/ui/ConfigSets/RecoveryPanel.vue';
import type { ImportFormat } from '@/core/io/IoTypes';
const store = useConfigStore(),
  router = useRouter();
const panel = ref<'welcome' | 'open' | 'import'>('welcome');
const showCreate = ref(false),
  showImport = ref(false),
  importFormat = ref<ImportFormat>('json');
onMounted(() => {
  void store.initialize();
});
function openImport(format: ImportFormat): void {
  importFormat.value = format;
  showImport.value = true;
}
async function openProject(uuid: string): Promise<void> {
  if (await store.openProject(uuid).catch(() => false)) await router.push('/workspace');
}
async function openSet(uuid: string): Promise<void> {
  if (await store.switchConfigSet(uuid).catch(() => false)) await router.push('/workspace');
}
</script>
<style scoped>
.configurator-start {
  min-height: 100vh;
  background: var(--color-surface);
  color: var(--color-text);
}
header {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 54px;
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
  min-height: calc(100vh - 54px);
}
aside {
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
aside button:hover,
aside button.selected {
  color: var(--color-accent);
  background: var(--color-selected);
}
main {
  width: min(860px, 100%);
  box-sizing: border-box;
  padding: 48px 44px;
}
.eyebrow {
  color: var(--color-accent);
  font-size: 11px;
  letter-spacing: 0.15em;
}
h1 {
  font-size: 30px;
  font-weight: 600;
  margin: 10px 0;
}
.lead {
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-muted);
}
.start-actions {
  display: flex;
  gap: 12px;
  margin: 24px 0 36px;
}
.start-actions button {
  padding: 10px 22px;
  font-size: 14px;
}
.start-actions .primary {
  color: var(--color-surface);
  background: var(--color-accent);
  border-color: var(--color-accent);
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
