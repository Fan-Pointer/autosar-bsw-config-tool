<template>
  <div class="workspace-container">
    <header class="workspace-header">
      <div class="header-left">
        <el-button link @click="router.push('/')"
          ><el-icon><ArrowLeft /></el-icon>返回</el-button
        >
        <span class="config-name">{{ store.module?.shortName ?? '配置' }}</span>
        <el-tag v-if="store.isDirty" type="warning">未保存</el-tag>
      </div>
      <div class="header-right">
        <el-button :loading="store.isLoading" @click="saveConfig"
          ><el-icon><Check /></el-icon>保存</el-button
        >
        <el-button @click="store.validate()">验证</el-button>
        <el-button type="primary" @click="generateCode"
          ><el-icon><Download /></el-icon>生成 C 代码</el-button
        >
      </div>
    </header>
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" />
    <main class="workspace-main">
      <aside class="workspace-sidebar">
        <ConfigTree
          :module="store.module"
          :config="store.config ?? undefined"
          :selected-key="store.selectedKey"
          @node-click="selectNode"
        />
      </aside>
      <section class="workspace-content">
        <template v-if="store.selectedEntry">
          <div class="content-heading">
            <h2>{{ store.selectedEntry.container.shortName }}</h2>
            <p>{{ store.selectedEntry.definition.description }}</p>
          </div>
          <DynamicForm
            :container="store.selectedEntry.definition"
            :config-data="store.parameterData"
            :reference-data="store.referenceData"
            :reference-options="store.referenceOptions"
            @parameter-change="store.setParameterValue"
            @reference-change="store.setReferenceTarget"
          />
        </template>
        <el-empty v-else description="选择一个配置项开始编辑" />
      </section>
      <aside class="workspace-help">
        <ValidationPanel
          :violations="store.violations"
          :validated="store.validated"
          @validate="store.validate()"
          @navigate="navigateViolation"
        />
      </aside>
    </main>
    <el-dialog v-model="showGenerated" title="生成的 C 配置文件" width="80%">
      <el-tabs>
        <el-tab-pane v-for="file in generatedFiles" :key="file.filename" :label="file.filename">
          <el-button size="small" @click="downloadFile(file)">下载 {{ file.filename }}</el-button>
          <pre class="generated-code">{{ file.content }}</pre>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check, Download } from '@element-plus/icons-vue';
import { useConfigStore } from '@/stores/configStore';
import { CGenerator } from '@/core/generator/CGenerator';
import type { GeneratedFile } from '@/core/generator/TemplateEngine';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import ConfigTree from '@/ui/ConfigTree/ConfigTree.vue';
import DynamicForm from '@/ui/FormEditor/DynamicForm.vue';
import ValidationPanel from '@/ui/Validator/ValidationPanel.vue';

const router = useRouter();
const store = useConfigStore();
const generatedFiles = ref<GeneratedFile[]>([]);
const showGenerated = ref(false);

onMounted(async () => {
  if (!store.config && !(await store.loadConfig())) store.createConfig();
});

async function focusField(uuid?: string): Promise<void> {
  if (!uuid) return;
  await nextTick();
  const field = document.getElementById(`field-${uuid}`);
  field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  field?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus();
}
function selectNode(node: { containerUuid?: string; definitionRef?: string; type: string }): void {
  if (!node.containerUuid) return;
  const field = node.type === 'container' ? undefined : node.definitionRef;
  store.selectContainer(node.containerUuid, field);
  void focusField(field);
}
function navigateViolation(violation: ConstraintViolation): void {
  if (!violation.containerUuid) return;
  store.selectContainer(violation.containerUuid, violation.definitionRef);
  void focusField(violation.definitionRef);
}
async function saveConfig(): Promise<void> {
  if (await store.saveConfig()) ElMessage.success('已保存到本机');
}
async function generateCode(): Promise<void> {
  if (!store.config || !store.module) return;
  if (store.validate().some((violation) => violation.severity === 'ERROR')) {
    ElMessage.warning('请先修复验证错误');
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
</script>

<style scoped>
.workspace-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.workspace-header {
  height: 56px;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.config-name {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}
.workspace-main {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.workspace-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid #dcdfe6;
  overflow: auto;
}
.workspace-content {
  flex: 1;
  min-width: 260px;
  background: #fff;
  overflow-y: auto;
}
.content-heading {
  padding: 16px 20px 0;
}
.content-heading h2 {
  font-size: 18px;
  margin: 0;
}
.content-heading p {
  color: #606266;
  font-size: 13px;
}
.workspace-help {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid #dcdfe6;
}
.generated-code {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  background: #f5f7fa;
}
</style>
