<template>
  <el-dialog
    v-if="modelValue"
    :model-value="modelValue"
    title="新建工程"
    top="24px"
    width="min(960px, 94vw)"
    class="project-wizard"
    :close-on-click-modal="!store.projectBusy"
    :close-on-press-escape="!store.projectBusy"
    :show-close="!store.projectBusy"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <ol class="wizard-steps" aria-label="创建进度">
      <li :class="{ current: step === 1 }">01 工程属性</li>
      <li :class="{ current: step === 2 }">02 选择模块</li>
    </ol>
    <form @submit.prevent="step === 1 ? next() : create()">
      <div v-if="step === 1" class="project-fields">
        <label class="wide"
          >工程名称 <span class="required">*</span
          ><input
            v-model="name"
            aria-label="工程名称"
            placeholder="例如：车身控制器"
            maxlength="80"
            required
            autofocus
        /></label>
        <label
          >AUTOSAR 版本<select v-model="version" aria-label="AUTOSAR 版本">
            <option value="4.4.0">Classic Platform 4.4.0</option>
            <option value="4.2.2">Classic Platform 4.2.2</option>
          </select></label
        >
        <label
          >芯片型号<select v-model="chip" aria-label="芯片型号">
            <option>S32K1XX</option>
            <option>S32K3XX</option>
          </select></label
        >
        <label class="wide"
          >描述 <span class="optional">可选</span
          ><textarea
            v-model="note"
            aria-label="工程描述"
            placeholder="记录工程用途或硬件信息"
            maxlength="300"
            rows="3"
          />
        </label>
        <p class="wizard-hint wide">芯片型号用于标识工程，当前不包含芯片驱动或 MCAL 适配。</p>
      </div>
      <div v-else>
        <div class="selection-heading">
          <div>
            <h3>{{ name }}</h3>
            <p>CP {{ version }} · {{ chip }}</p>
          </div>
          <span>已选择 {{ selected.length }} 个模块</span>
        </div>
        <ModuleSelector v-model="selected" :entries="versionCatalog" :busy="store.projectBusy" />
        <p class="wizard-hint catalog-hint">
          CP {{ version }} 共 {{ versionCatalog.length }} 个标准模块，{{
            versionCatalog.filter((entry) => entry.status !== 'unsupported').length
          }}
          个已通过当前配置与输出边界验证。有限制或待支持的模块可查看具体原因。
        </p>
      </div>
      <p v-if="message" role="alert" class="wizard-error">{{ message }}</p>
      <div class="wizard-footer">
        <button
          type="button"
          :disabled="store.projectBusy"
          @click="emit('update:modelValue', false)"
        >
          取消
        </button>
        <span />
        <button v-if="step === 2" type="button" :disabled="store.projectBusy" @click="step = 1">
          上一步
        </button>
        <button
          type="submit"
          class="wizard-primary"
          :disabled="store.projectBusy || (step === 1 ? !name.trim() : !selected.length)"
        >
          {{ step === 1 ? '下一步 →' : store.projectBusy ? '正在创建…' : '创建并打开' }}
        </button>
      </div>
    </form>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import { builtinCatalog } from '@/modules/builtinCatalog';
import ModuleSelector from '@/ui/Modules/ModuleSelector.vue';
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; opened: [] }>();
const store = useConfigStore();
const step = ref(1),
  name = ref(''),
  version = ref('4.4.0'),
  chip = ref('S32K1XX'),
  note = ref(''),
  message = ref('');
const selected = ref<string[]>(['Dem']);
const versionCatalog = computed(() =>
  builtinCatalog.filter((entry) => entry.release === version.value)
);
watch(version, () => {
  selected.value = ['Dem'];
});
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    step.value = 1;
    name.value = '';
    version.value = '4.4.0';
    chip.value = 'S32K1XX';
    note.value = '';
    selected.value = ['Dem'];
    message.value = '';
  }
);
function next(): void {
  if (name.value.trim()) step.value = 2;
}
async function create(): Promise<void> {
  message.value = '';
  try {
    if (
      await store.createProject({
        name: name.value,
        autosarVersion: version.value,
        chip: { family: chip.value, note: note.value },
        moduleShortNames: selected.value,
      })
    ) {
      emit('update:modelValue', false);
      emit('opened');
    } else message.value = store.projectError ?? store.error ?? '工程创建失败，请重试';
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error);
  }
}
</script>
<style scoped>
.wizard-steps {
  display: flex;
  list-style: none;
  padding: 0 0 14px;
  margin: 0 0 16px;
  gap: 28px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-muted);
  font-size: 14px;
}
.wizard-steps .current {
  color: var(--color-accent);
  font-weight: 650;
}
.project-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}
.project-fields label {
  font-size: 14px;
  color: var(--color-text);
}
.wide {
  grid-column: 1/-1;
}
input:not([type='checkbox']),
select,
textarea {
  display: block;
  margin-top: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.required {
  color: var(--color-error);
}
.optional {
  color: var(--color-muted);
  font-size: 12px;
  margin-left: 5px;
}
.wizard-hint {
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-muted);
  margin: 0;
}
.wizard-footer {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}
.wizard-footer span {
  flex: 1;
}
button {
  padding: 10px 18px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 7px;
  font: inherit;
  cursor: pointer;
}
.wizard-primary {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.selection-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
h3 {
  margin: 0;
  color: var(--color-text);
}
.selection-heading p,
.selection-heading > span {
  font-size: 13px;
  color: var(--color-muted);
}
.wizard-error {
  color: var(--color-error);
}
@media (max-width: 600px) {
  .project-fields {
    grid-template-columns: 1fr;
  }
  .selection-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .wizard-footer {
    flex-wrap: wrap;
  }
}
</style>

<style scoped>
.catalog-hint {
  margin-top: 12px;
}
:global(.project-wizard .el-dialog__body) {
  max-height: calc(100vh - 110px);
  overflow: auto;
}
:global(.project-wizard) {
  margin-bottom: 24px;
}
</style>
