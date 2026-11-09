<template>
  <PortalLayout>
    <RecoveryPanel />
    <section class="catalog-hero" aria-labelledby="catalog-title">
      <div>
        <p class="catalog-wordmark">汽车软件开发平台</p>
        <h1 id="catalog-title">让每一项配置，清晰有序。</h1>
        <p class="catalog-summary">
          从模块定义到工程配置，将编辑、校验与代码生成<br
            class="desktop-break"
          />连接在一个轻盈、专注的工作空间。
        </p>
        <div class="hero-tags">
          <span>定义驱动</span><span>本机保存</span><span>可视化编辑</span>
        </div>
      </div>
      <figure class="catalog-blueprint" aria-label="汽车软件工程示意图">
        <span class="blueprint-label">AUTOMOTIVE SOFTWARE</span>
        <svg viewBox="0 0 600 310" fill="none" aria-hidden="true">
          <defs>
            <linearGradient
              id="car-fill"
              x1="180"
              y1="80"
              x2="310"
              y2="240"
              gradientUnits="userSpaceOnUse"
            >
              <stop stop-color="#fff" />
              <stop offset="1" stop-color="#d6e8ff" />
            </linearGradient>
          </defs>
          <ellipse cx="302" cy="239" rx="213" ry="24" fill="#bad4f5" opacity=".28" />
          <g stroke="#4580c2" stroke-width="1.8" stroke-linejoin="round">
            <path
              d="m89 194 28-47 119-38 132 7 76 56 55 18-6 35-71 22-198-2-116-24Z"
              fill="url(#car-fill)"
            />
            <path d="m138 151 99-31 110 6 63 44-155 4-117-23Z" fill="#eaf3ff" />
            <path
              d="m237 120 18 54m92-48-25 48m-184-23-8 37 130 26 150-8 34-34m-184 2v40m62-40-3 33M90 194l170 35 233-4m-233-11v15"
            />
            <path d="m108 183 33 8-8 12-34-8m352-6 33 10-3 13-39-9" fill="#fff" />
            <ellipse cx="175" cy="216" rx="25" ry="32" fill="#eff6ff" />
            <ellipse cx="175" cy="216" rx="12" ry="18" />
            <ellipse cx="413" cy="218" rx="25" ry="32" fill="#eff6ff" />
            <ellipse cx="413" cy="218" rx="12" ry="18" />
          </g>
          <g stroke="#7da7d9" stroke-width="1.2" stroke-dasharray="4 5">
            <path d="M179 160V65H90m238 130V69h92M293 189v89h-77" />
          </g>
          <g fill="#fff" stroke="#adc9e9">
            <rect x="47" y="44" width="88" height="34" rx="7" />
            <rect x="467" y="48" width="90" height="34" rx="7" />
            <rect x="133" y="261" width="104" height="33" rx="7" />
          </g>
          <g fill="#3c6fa9" font-size="12" font-family="Segoe UI, sans-serif">
            <text x="65" y="66">AUTOSAR</text>
            <text x="489" y="70">BSW</text>
            <text x="152" y="282">ECU CONFIG</text>
          </g>
          <g fill="#2563b4" stroke="#fff" stroke-width="3">
            <circle cx="179" cy="160" r="5" />
            <circle cx="417" cy="195" r="5" />
            <circle cx="293" cy="189" r="5" />
          </g>
        </svg>
        <figcaption><span>OneSAR</span><span>从配置开始，向工程交付前进</span></figcaption>
      </figure>
    </section>
    <section class="catalog-directory" aria-labelledby="directory-title">
      <div class="section-heading">
        <h2 id="directory-title">工具与服务</h2>
      </div>
      <div class="catalog-grid">
        <article class="catalog-config">
          <div class="catalog-card-intro">
            <span class="catalog-icon"
              ><el-icon><SetUp /></el-icon></span
            ><span>基础软件配置工具</span><span class="available-tag">● 可用</span>
          </div>
          <h3>OneSAR Configurator</h3>
          <p>管理本机工程，完成基础软件配置、约束校验与代码生成。</p>
          <div class="config-actions">
            <button class="catalog-primary" :disabled="store.isLoading" @click="openConfigurator">
              打开配置器 <span aria-hidden="true">↗</span></button
            ><button
              class="catalog-quiet"
              :disabled="store.isLoading || store.dataSafety.locked"
              @click="showCreate = true"
            >
              ＋ 新建工程
            </button>
          </div>
          <svg class="catalog-watermark" viewBox="0 0 160 160" fill="none" aria-hidden="true">
            <path
              d="M84 25 140 53v58L84 139l-56-28V53l56-28Zm0 0v114M28 53l56 29 56-29M28 82l56 29 56-29M56 39l56 28v58M112 39 56 67v58"
            />
          </svg>
        </article>
        <article class="catalog-side">
          <span class="catalog-icon"
            ><el-icon><Tickets /></el-icon
          ></span>
          <div>
            <h3>订阅中心 <small>待更新</small></h3>
            <p>功能订阅与服务信息。</p>
          </div>
          <RouterLink class="catalog-secondary" to="/subscription">查看订阅 →</RouterLink>
        </article>
        <article class="catalog-side">
          <span class="catalog-icon"
            ><el-icon><Reading /></el-icon
          ></span>
          <div>
            <h3>知识库 <small>待更新</small></h3>
            <p>技术资料与配置使用指南。</p>
          </div>
          <RouterLink class="catalog-secondary" to="/knowledge">浏览知识库 →</RouterLink>
        </article>
      </div>
    </section>
    <section class="project-section" aria-labelledby="projects-title">
      <div class="section-heading">
        <h2 id="projects-title">
          本机工程
          <small>{{ store.projects.length + (store.unassignedSets.length ? 1 : 0) }}</small>
        </h2>
      </div>
      <p
        v-if="navigationError || store.error || store.projectError"
        role="alert"
        class="project-error"
      >
        {{ navigationError || store.projectError || store.error }}
      </p>
      <p v-for="warning in store.projectWarnings" :key="warning" class="project-warning">
        {{ warning }}
      </p>
      <div v-if="store.projects.length || store.unassignedSets.length" class="project-list">
        <div v-for="project in store.projects" :key="project.projectUuid" class="project-row">
          <span class="project-folder" aria-hidden="true"
            ><el-icon><FolderOpened /></el-icon
          ></span>
          <div class="project-info">
            <strong>{{ project.name }}</strong>
            <p>
              CP {{ project.autosarVersion }} · {{ project.chip.family }} ·
              {{ project.moduleShortNames.join(' / ') }}
            </p>
          </div>
          <button
            class="row-open"
            :disabled="store.isLoading"
            @click="openProject(project.projectUuid)"
          >
            打开 →</button
          ><button
            class="row-more"
            title="移除工程归属，保留配置数据"
            :aria-label="'移除工程 ' + project.name"
            @click="removeProject(project.projectUuid, project.name)"
          >
            移除归属
          </button>
        </div>
        <template v-if="store.unassignedSets.length"
          ><div class="default-caption">默认工程 <span>已有配置保留在这里</span></div>
          <div v-for="set in store.unassignedSets" :key="set.uuid" class="project-row">
            <span class="project-folder" aria-hidden="true"
              ><el-icon><Document /></el-icon
            ></span>
            <div class="project-info">
              <strong>{{ set.name ?? set.moduleRef }}</strong>
              <p>{{ set.moduleRef }} · CP {{ set.version }}</p>
            </div>
            <button class="row-open" :disabled="store.isLoading" @click="openSet(set.uuid)">
              打开
            </button>
          </div></template
        >
      </div>
      <div v-else class="empty-projects">
        <div>
          <strong>开始你的第一个工程</strong>
          <p>选择 AUTOSAR 版本、芯片与所需模块，进入配置工作区。</p>
        </div>
        <button
          class="catalog-secondary"
          :disabled="store.isLoading || store.dataSafety.locked"
          @click="showCreate = true"
        >
          ＋ 新建工程
        </button>
      </div>
    </section>
    <ProjectWizard v-model="showCreate" @opened="enterWorkspace" />
  </PortalLayout>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { SetUp, Tickets, Reading, FolderOpened, Document } from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import PortalLayout from '@/ui/Portal/PortalLayout.vue';
import ProjectWizard from '@/ui/Projects/ProjectWizard.vue';
import { useProjectNavigation } from '@/ui/Projects/useProjectNavigation';
import RecoveryPanel from '@/ui/ConfigSets/RecoveryPanel.vue';
const router = useRouter(),
  store = useConfigStore(),
  showCreate = ref(false);
const { navigationError, openProject, openSet, enterWorkspace } = useProjectNavigation();
onMounted(() => {
  void store.initialize();
});
function openConfigurator(): void {
  void router.push('/configurator');
}
async function removeProject(uuid: string, name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `移除工程「${name}」的分组？配置数据会保留在默认工程中。`,
      '移除工程归属',
      { confirmButtonText: '移除归属', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  await store.removeProject(uuid).catch(() => false);
}
</script>
<style scoped>
.catalog-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
  align-items: center;
  gap: 32px;
}
.catalog-wordmark {
  margin: 0 0 14px;
  color: #60728a;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
h1 {
  font-size: clamp(30px, 2.8vw, 40px);
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.03em;
  margin: 0;
  max-width: 15em;
  text-wrap: balance;
}
.catalog-summary {
  color: #607189;
  font-size: 15px;
  line-height: 1.9;
  margin: 14px 0;
}
.hero-tags {
  display: flex;
  gap: 18px;
  font-size: 12px;
  color: #526d90;
}
.hero-tags span::before {
  content: '✓';
  color: #3178c5;
  margin-right: 7px;
}
.catalog-blueprint {
  position: relative;
  margin: 0;
  border: 1px solid #d8e6f7;
  border-radius: 18px;
  overflow: hidden;
  height: 250px;
  padding: 14px 0 26px;
  background-color: #f3f8ff;
  background-image:
    linear-gradient(#dce9fa80 1px, transparent 1px),
    linear-gradient(90deg, #dce9fa80 1px, transparent 1px);
  background-size: 26px 26px;
}
.catalog-blueprint::before {
  content: '';
  position: absolute;
  inset: 14px;
  border: 1px solid #bbd1ee;
  border-radius: 7px;
  pointer-events: none;
}
.catalog-blueprint svg {
  display: block;
  width: 100%;
  height: 205px;
  margin: 4px auto 0;
}
.blueprint-label {
  position: relative;
  margin-left: 29px;
  color: #6c8cb5;
  font-size: 10px;
  letter-spacing: 0.15em;
}
.catalog-blueprint figcaption {
  position: absolute;
  left: 29px;
  right: 29px;
  bottom: 17px;
  display: flex;
  justify-content: space-between;
  color: #58779d;
  font-size: 11px;
}
figcaption span:first-child {
  font-weight: 700;
}
.catalog-directory {
  margin-top: 22px;
}
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
h2 {
  font-size: 21px;
  font-weight: 650;
  margin: 0;
}
.section-heading > span {
  color: #7a889b;
  font-size: 12px;
}
h2 small {
  display: inline-block;
  background: #edf3fb;
  color: #56718e;
  font-size: 12px;
  padding: 3px 7px;
  border-radius: 5px;
  vertical-align: middle;
  margin-left: 8px;
}
.catalog-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  grid-template-rows: repeat(2, minmax(84px, auto));
  gap: 12px;
}
.catalog-grid article {
  min-width: 0;
  border-radius: 13px;
}
.catalog-config {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  grid-row: span 2;
  padding: 18px 22px;
  color: #fff;
  background: linear-gradient(118deg, #154ca6 4%, #1263d0 100%);
}
.catalog-card-intro {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: #deebff;
}
.catalog-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 42px;
  color: #1857b4;
  background: #e8f1ff;
  border-radius: 10px;
  font-size: 22px;
}
.catalog-config .catalog-icon {
  color: #fff;
  background: #ffffff24;
}
.available-tag {
  margin-left: auto;
  border: 1px solid #ffffff30;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 11px;
}
.catalog-config h3 {
  font-size: 26px;
  margin: 10px 0 7px;
  letter-spacing: -0.03em;
}
.catalog-config p {
  font-size: 14px;
  color: #e6f0ff;
  line-height: 1.7;
  margin: 0 0 13px;
  max-width: 400px;
}
.catalog-watermark {
  position: absolute;
  z-index: -1;
  width: 230px;
  bottom: -48px;
  right: -10px;
  stroke: #a4ceff;
  stroke-width: 1;
  opacity: 0.24;
}
.config-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
.catalog-primary,
.catalog-secondary,
.catalog-quiet {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  font-family: inherit;
}
.catalog-primary {
  color: #144f9f;
  border: 1px solid #fff;
  background: #fff;
}
.catalog-primary:hover {
  background: #eaf3ff;
}
.catalog-quiet {
  color: #fff;
  background: transparent;
  border: 1px solid #ffffff50;
}
.catalog-quiet:hover {
  background: #ffffff18;
}
.catalog-secondary {
  color: #1855a8;
  border: 1px solid #ccdcef;
  background: #fff;
}
.catalog-secondary:hover {
  background: #edf5ff;
  border-color: #9cbce4;
}
.catalog-side {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 18px;
  background: #f8fbff;
  border: 1px solid #dce6f2;
}
.catalog-side h3 {
  font-size: 17px;
  margin: 0 0 7px;
  font-weight: 650;
}
.catalog-side h3 small {
  font-size: 10px;
  color: #788ba2;
  font-weight: 400;
  margin-left: 7px;
}
.catalog-side p {
  color: #6d7e94;
  font-size: 13px;
  margin: 0;
}
.project-section {
  margin-top: 32px;
}
.project-list {
  border: 1px solid #e0e7f0;
  border-radius: 12px;
  overflow: hidden;
}
.project-row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px 20px;
}
.project-row + .project-row {
  border-top: 1px solid #edf1f6;
}
.project-folder {
  color: #547aab;
  background: #f0f5fb;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  font-size: 21px;
}
.project-info {
  flex: 1;
  min-width: 0;
}
.project-info strong {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.project-info p {
  margin: 6px 0 0;
  font-size: 12px;
  color: #77869a;
}
.row-open,
.row-more {
  background: none;
  color: #1855a8;
  font-size: 13px;
  border: 0;
  cursor: pointer;
  padding: 8px;
}
.row-more {
  color: #78899f;
  font-size: 11px;
}
.default-caption {
  font-size: 13px;
  padding: 12px 20px;
  background: #f7f9fc;
  color: #5f7592;
}
.default-caption span {
  font-size: 11px;
  margin-left: 12px;
  color: #8b97a7;
}
.empty-projects {
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border: 1px dashed #d1ddeb;
  border-radius: 12px;
  background: #fcfdff;
}
.empty-projects strong {
  font-size: 14px;
}
.empty-projects p {
  font-size: 12px;
  color: #77869a;
  margin-bottom: 0;
}
.project-error {
  color: #b42335;
}
.project-warning {
  color: #93651b;
  font-size: 13px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid #6c9ee7;
  outline-offset: 3px;
}
@media (max-width: 1080px) {
  .catalog-side {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .catalog-side .catalog-secondary {
    grid-column: 2;
    justify-self: start;
  }
  .desktop-break {
    display: none;
  }
  .catalog-hero {
    gap: 26px;
  }
  .catalog-blueprint {
    height: 240px;
  }
}
@media (max-width: 720px) {
  .catalog-hero,
  .catalog-grid {
    grid-template-columns: 1fr;
  }
  .catalog-hero {
    gap: 24px;
  }
  .catalog-blueprint {
    height: 230px;
  }
  .catalog-blueprint svg {
    max-height: 250px;
  }
  .catalog-config {
    grid-row: auto;
    padding: 22px;
  }
  .catalog-config h3 {
    font-size: 26px;
  }
  .catalog-side {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .catalog-side .catalog-secondary {
    grid-column: auto;
  }
  .section-heading > span {
    font-size: 11px;
  }
  .project-row {
    flex-wrap: wrap;
    padding: 14px;
  }
  .project-info {
    min-width: 60%;
  }
  .empty-projects {
    align-items: flex-start;
    flex-direction: column;
  }
  .hero-tags {
    gap: 16px;
  }
}
@media (max-width: 420px) {
  .catalog-side {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .catalog-side .catalog-secondary {
    grid-column: 2;
  }
  .catalog-wordmark {
    font-size: 17px;
    gap: 9px;
  }
  .catalog-wordmark span {
    font-size: 11px;
  }
  .config-actions {
    gap: 8px;
    flex-wrap: wrap;
  }
}
</style>
