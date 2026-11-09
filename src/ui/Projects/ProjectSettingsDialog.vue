<template>
  <el-dialog
    v-if="modelValue"
    :model-value="true"
    :title="mode === 'edit' ? '编辑工程' : '工程详情'"
    width="min(520px, 94vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="project">
      <el-form v-if="mode === 'edit'" label-width="92px" size="small" @submit.prevent>
        <el-form-item label="工程名称" required>
          <el-input v-model="form.name" maxlength="40" aria-label="工程名称" />
        </el-form-item>
        <el-form-item label="工程描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="100"
            show-word-limit
            aria-label="工程描述"
          />
        </el-form-item>
        <el-form-item label="AUTOSAR 版本">
          <el-input :model-value="project.autosarVersion + '（不可修改）'" disabled aria-label="AUTOSAR 版本" />
        </el-form-item>
        <el-form-item label="芯片型号">
          <el-select v-model="form.chip" aria-label="芯片型号">
            <el-option label="S32K1XX" value="S32K1XX" />
            <el-option label="S32K3XX" value="S32K3XX" />
          </el-select>
        </el-form-item>
        <p class="dialog-hint" data-edit-hint>
          修改 AUTOSAR 版本会使模块定义与全部配置失效，因此不提供该项；如需换版本请新建工程并重新选择模块。
        </p>
      </el-form>
      <dl v-else class="detail-list" aria-label="工程详情">
        <div><dt>工程名称</dt><dd>{{ project.name }}</dd></div>
        <div><dt>工程描述</dt><dd>{{ project.description || '—' }}</dd></div>
        <div><dt>AUTOSAR 版本</dt><dd>{{ project.autosarVersion }}</dd></div>
        <div><dt>芯片型号</dt><dd>{{ project.chip.family }}</dd></div>
        <div><dt>模块数</dt><dd>{{ project.moduleShortNames.length }}</dd></div>
        <div><dt>配置集数</dt><dd>{{ project.setUuids.length }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ formatTime(project.createdAt) }}</dd></div>
        <div><dt>最后修改</dt><dd>{{ formatTime(project.updatedAt ?? project.createdAt) }}</dd></div>
      </dl>
    </template>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="mode === 'edit'" type="primary" :disabled="busy" @click="save">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import type { ProjectMetadata } from '@/stores/projectMetadata';

const props = defineProps<{
  modelValue: boolean;
  mode: 'edit' | 'detail';
  project?: ProjectMetadata;
}>();
const emit = defineEmits<{ 'update:modelValue': [visible: boolean]; saved: [] }>();
const store = useConfigStore();
const busy = ref(false);
const form = ref({ name: '', description: '', chip: '' });

watch(
  () => [props.modelValue, props.mode, props.project?.projectUuid],
  () => {
    if (!props.modelValue || !props.project) return;
    form.value = {
      name: props.project.name,
      description: props.project.description ?? '',
      chip: props.project.chip.family,
    };
  },
  { immediate: true }
);

async function save(): Promise<void> {
  if (!props.project || busy.value) return;
  busy.value = true;
  try {
    await store.updateProject(props.project.projectUuid, {
      name: form.value.name,
      description: form.value.description,
      chip: { family: form.value.chip, note: props.project.chip.note },
    });
    ElMessage.success('工程信息已更新');
    emit('saved');
    emit('update:modelValue', false);
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  } finally {
    busy.value = false;
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.dialog-hint {
  margin: 4px 0 0 92px;
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.5;
}
.detail-list {
  margin: 0;
  font-size: 13px;
}
.detail-list div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px solid var(--color-border);
}
.detail-list dt {
  color: var(--color-muted);
}
.detail-list dd {
  margin: 0;
  color: var(--color-text);
  word-break: break-all;
}
</style>
