<template>
  <div class="dynamic-form">
    <section class="parameter-section" aria-label="参数">
      <div
        v-for="param in container.parameters"
        :id="'field-' + param.uuid"
        :key="param.uuid"
        class="parameter-row"
        :class="{
          'is-required': !param.isOptional,
          'selected-field': selectedFieldUuid === param.uuid,
        }"
        :data-field="param.uuid"
      >
        <input
          v-if="param.isOptional"
          class="optional-toggle"
          type="checkbox"
          :aria-label="'启用 ' + param.shortName"
          :checked="enabled(param)"
          :disabled="readonly || param.readOnly"
          @change="toggle(param, ($event.target as HTMLInputElement).checked)"
        />
        <span v-else class="optional-space" />
        <label :title="param.description" :for="'input-' + param.uuid">{{ param.shortName }}</label>
        <span class="required-mark" :title="!param.isOptional ? '必填参数' : undefined">{{
          !param.isOptional ? '⊗' : ''
        }}</span>
        <div
          class="field-control"
          :class="{ numeric: param.type === 'INTEGER' || param.type === 'FLOAT' }"
        >
          <template v-if="param.type === 'INTEGER' || param.type === 'FLOAT'">
            <el-input
              v-if="radices[param.uuid] === 'HEX'"
              :id="'input-' + param.uuid"
              :aria-label="param.shortName"
              :model-value="hexDrafts[param.uuid] ?? hexValue(param)"
              :disabled="readonly || param.readOnly || !enabled(param)"
              @update:model-value="editHex(param, $event)"
            />
            <el-input
              v-else-if="invalidNumeric(param)"
              :id="'input-' + param.uuid"
              :aria-label="param.shortName"
              :model-value="String(rawValue(param) ?? '')"
              :disabled="readonly || param.readOnly || !enabled(param)"
              @update:model-value="editInvalidNumeric(param, $event)"
            />
            <el-input-number
              v-else
              :id="'input-' + param.uuid"
              :aria-label="param.shortName"
              :model-value="numberValue(param)"
              :min="param.min"
              :max="param.max"
              :step="param.type === 'FLOAT' ? 0.1 : 1"
              :precision="param.type === 'INTEGER' ? 0 : undefined"
              :controls="false"
              :disabled="readonly || param.readOnly || !enabled(param)"
              @update:model-value="onValueChange(param.uuid, $event)"
            />
            <select
              class="radix"
              :aria-label="param.shortName + ' 进制'"
              :value="radices[param.uuid] ?? 'DEC'"
              :disabled="readonly || param.readOnly || !enabled(param)"
              @change="radices[param.uuid] = ($event.target as HTMLSelectElement).value"
            >
              <option>DEC</option>
              <option>HEX</option>
            </select>
          </template>
          <el-select
            v-else-if="param.type === 'ENUM'"
            :id="'input-' + param.uuid"
            :aria-label="param.shortName"
            :model-value="stringValue(param)"
            placeholder="请选择"
            :disabled="readonly || param.readOnly || !enabled(param)"
            @update:model-value="onValueChange(param.uuid, $event)"
          >
            <el-option
              v-for="value in param.enumValues"
              :key="value"
              :label="value"
              :value="value"
            />
          </el-select>
          <el-switch
            v-else-if="param.type === 'BOOLEAN'"
            :id="'input-' + param.uuid"
            :aria-label="param.shortName"
            :model-value="rawValue(param) === true"
            :disabled="readonly || param.readOnly || !enabled(param)"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
          <el-input
            v-else
            :id="'input-' + param.uuid"
            :aria-label="param.shortName"
            :model-value="stringValue(param)"
            :disabled="readonly || param.readOnly || !enabled(param)"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
        </div>
        <span v-if="numericErrors[param.uuid]" class="field-error" role="alert">{{
          numericErrors[param.uuid]
        }}</span>
      </div>
    </section>
    <section v-if="container.references.length" class="reference-section" aria-label="引用">
      <div
        v-for="reference in container.references"
        :id="'field-' + reference.uuid"
        :key="reference.uuid"
        class="parameter-row"
        :class="{
          'is-required': !reference.isOptional,
          'selected-field': selectedFieldUuid === reference.uuid,
          'dangling-reference': danglingReferences.includes(reference.uuid),
        }"
        :data-field="reference.uuid"
      >
        <span class="optional-space" />
        <label :title="reference.description" :for="'input-' + reference.uuid">{{
          reference.shortName
        }}</label>
        <span class="required-mark">{{ !reference.isOptional ? '⊗' : '' }}</span>
        <div class="field-control reference-control">
          <el-input
            :id="'input-' + reference.uuid"
            :aria-label="reference.shortName"
            :model-value="referenceLabel(reference.uuid)"
            readonly
          />
          <span
            :title="reference.isExternal ? '外部引用只读：本期不支持跨模块目标' : '选择引用目标'"
            ><button
              class="reference-picker"
              type="button"
              :disabled="readonly || reference.isExternal"
              :aria-label="'选择 ' + reference.shortName"
              @click="referencePicker = reference.uuid"
            >
              ▤
            </button></span
          >
        </div>
        <small v-if="reference.isExternal" class="field-error"
          >外部引用只读：本期不支持跨模块目标</small
        >
        <span v-if="danglingReferences.includes(reference.uuid)" class="field-error" role="alert">
          目标不存在（{{ referenceData[reference.uuid]?.slice(0, 8) }}）
          <button
            class="clear-reference"
            :disabled="readonly || reference.isExternal"
            @click="emit('reference-change', reference.uuid, '')"
          >
            清除引用
          </button>
        </span>
      </div>
    </section>
    <p v-if="!container.parameters.length && !container.references.length" class="no-fields">
      该容器没有可配置的字段
    </p>
    <el-dialog
      :model-value="Boolean(referencePicker)"
      title="选择引用目标"
      width="480px"
      @close="referencePicker = undefined"
    >
      <template v-if="referencePicker">
        <el-select
          :model-value="referenceData[referencePicker] || undefined"
          aria-label="引用目标"
          clearable
          filterable
          placeholder="选择目标实例"
          @update:model-value="chooseReference"
        >
          <el-option
            v-for="option in referenceOptions[referencePicker] ?? []"
            :key="option.uuid"
            :value="option.uuid"
            :label="option.label"
          />
        </el-select>
        <div
          v-if="!referenceOptions[referencePicker]?.length"
          class="reference-empty"
          role="status"
        >
          <p>
            暂无
            {{
              container.references.find((item) => item.uuid === referencePicker)
                ?.destinationContainerType
            }}
            实例，请先新增
          </p>
          <el-button
            v-for="option in referenceAddOptions[referencePicker] ?? []"
            :key="String(option.parentUuid) + option.definitionUuid"
            :disabled="readonly || Boolean(option.disabledReason)"
            :title="option.disabledReason"
            @click="
              emit(
                'create-reference-target',
                referencePicker,
                option.definitionUuid,
                option.parentUuid
              )
            "
            >新增 {{ option.label }}</el-button
          >
          <p v-if="!referenceAddOptions[referencePicker]?.length">
            请先新增目标父容器；跨模块目标当前不可创建。
          </p>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';
const props = withDefaults(
  defineProps<{
    container: BswmdContainer;
    configData?: Record<string, unknown>;
    referenceData?: Record<string, string>;
    referenceOptions?: Record<string, { uuid: string; label: string }[]>;
    referenceAddOptions?: Record<
      string,
      {
        definitionUuid: string;
        parentUuid: string | null;
        label: string;
        disabledReason?: string;
      }[]
    >;
    labelWidth?: string;
    readonly?: boolean;
    selectedFieldUuid?: string;
    danglingReferences?: string[];
  }>(),
  {
    configData: () => ({}),
    referenceData: () => ({}),
    referenceOptions: () => ({}),
    referenceAddOptions: () => ({}),
    readonly: false,
    danglingReferences: () => [],
  }
);
const emit = defineEmits<{
  'update:configData': [data: Record<string, unknown>];
  'parameter-change': [paramUuid: string, value: unknown];
  'reference-change': [refUuid: string, targetUuid: string];
  'create-reference-target': [refUuid: string, definitionUuid: string, parentUuid: string | null];
}>();
const radices = ref<Record<string, string>>({});
const numericErrors = ref<Record<string, string>>({});
const hexDrafts = ref<Record<string, string>>({});
watch(
  () => props.configData,
  () => {
    hexDrafts.value = {};
    numericErrors.value = {};
  },
  { deep: true }
);
const referencePicker = ref<string>();
function chooseReference(target: string | undefined): void {
  if (
    referencePicker.value &&
    !props.readonly &&
    !props.container.references.find((ref) => ref.uuid === referencePicker.value)?.isExternal
  )
    emit('reference-change', referencePicker.value, target ?? '');
  referencePicker.value = undefined;
}
function rawValue(parameter: BswmdParameter): unknown {
  // Explicit undefined means an unchecked optional field, not a request to restore the default.
  return Object.prototype.hasOwnProperty.call(props.configData, parameter.uuid)
    ? props.configData[parameter.uuid]
    : parameter.defaultValue;
}
function enabled(parameter: BswmdParameter): boolean {
  return !parameter.isOptional || rawValue(parameter) !== undefined;
}
function numberValue(parameter: BswmdParameter): number | undefined {
  const value = rawValue(parameter);
  return typeof value === 'number' ? value : undefined;
}
function invalidNumeric(parameter: BswmdParameter): boolean {
  const value = rawValue(parameter);
  if (value === undefined) return false;
  // InputNumber clamps incoming model values. Render unfinished/restored violations verbatim instead.
  return (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (parameter.type === 'INTEGER' && !Number.isSafeInteger(value)) ||
    (parameter.min !== undefined && value < parameter.min) ||
    (parameter.max !== undefined && value > parameter.max)
  );
}
function editInvalidNumeric(parameter: BswmdParameter, text: string): void {
  onValueChange(
    parameter.uuid,
    text.trim() && Number.isFinite(Number(text)) ? Number(text) : text || undefined
  );
}
function stringValue(parameter: BswmdParameter): string {
  const value = rawValue(parameter);
  return typeof value === 'string' ? value : '';
}
function toggle(parameter: BswmdParameter, checked: boolean): void {
  const initial =
    parameter.defaultValue ??
    (parameter.type === 'BOOLEAN'
      ? false
      : parameter.type === 'INTEGER' || parameter.type === 'FLOAT'
        ? (parameter.min ?? 0)
        : '');
  onValueChange(parameter.uuid, checked ? initial : undefined);
}
function hexValue(parameter: BswmdParameter): string {
  return numberValue(parameter)?.toString(16).toUpperCase() ?? '';
}
function editHex(parameter: BswmdParameter, value: string): void {
  hexDrafts.value[parameter.uuid] = value;
  changeHex(parameter, value);
}
function changeHex(parameter: BswmdParameter, value: string): void {
  const text = value.trim().replace(/^(-?)0x/i, '$1');
  if (!/^-?[\da-f]+(?:\.[\da-f]+)?$/i.test(text)) {
    numericErrors.value[parameter.uuid] = '请输入有效十六进制数';
    return;
  }
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const number =
    (parseInt(whole, 16) +
      [...fraction].reduce(
        (sum, digit, index) => sum + parseInt(digit, 16) / 16 ** (index + 1),
        0
      )) *
    (text.startsWith('-') ? -1 : 1);
  if (
    !Number.isFinite(number) ||
    (parameter.type === 'INTEGER' && !Number.isSafeInteger(number)) ||
    (parameter.min !== undefined && number < parameter.min) ||
    (parameter.max !== undefined && number > parameter.max)
  ) {
    numericErrors.value[parameter.uuid] = '数值超出定义范围';
    return;
  }
  delete numericErrors.value[parameter.uuid];
  onValueChange(parameter.uuid, number);
}
function referenceLabel(uuid: string): string {
  const target = props.referenceData[uuid];
  return (
    props.referenceOptions[uuid]?.find((item) => item.uuid === target)?.label || target || '--'
  );
}
function onValueChange(uuid: string, value: unknown): void {
  if (props.readonly || props.container.parameters.find((p) => p.uuid === uuid)?.readOnly) return;
  emit('update:configData', { ...props.configData, [uuid]: value });
  emit('parameter-change', uuid, value);
}
/** Return parent-owned values without mutation. @returns Value snapshot. */
function getFormData(): Record<string, unknown> {
  return { ...props.configData };
}
/** Restore definition defaults through edit events. @returns Nothing. */
function resetForm(): void {
  if (props.readonly) return;
  const values: Record<string, unknown> = {};
  for (const parameter of props.container.parameters) {
    if (parameter.readOnly) {
      values[parameter.uuid] = rawValue(parameter);
      continue;
    }
    values[parameter.uuid] = parameter.defaultValue;
    emit('parameter-change', parameter.uuid, parameter.defaultValue);
  }
  emit('update:configData', values);
}
defineExpose({ resetForm, getFormData });
</script>

<style scoped>
.dynamic-form {
  padding: 0 22px;
  color: var(--color-text);
  font-size: 14px;
}
.parameter-section {
  padding: 16px 0;
}
.reference-section {
  padding: 16px 0;
  border-top: 1px solid var(--color-border);
}
.parameter-row {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(170px, 245px) 20px 270px;
  align-items: center;
  min-height: 53px;
  gap: 8px;
  padding-left: 16px;
}
.parameter-row label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selected-field {
  background: var(--color-selected);
  outline: 1px solid var(--color-accent);
}
.dangling-reference {
  color: var(--color-error);
}
.dangling-reference :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--color-error) inset;
}
.clear-reference {
  color: var(--color-error);
  background: transparent;
  border: 1px solid var(--color-error);
  margin-left: 8px;
  cursor: pointer;
}
.optional-toggle {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--color-accent);
}
.required-mark {
  color: var(--color-error);
  font-size: 15px;
  text-align: center;
}
.field-control {
  min-width: 0;
  width: 270px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}
.numeric {
  display: flex;
}
.numeric :deep(.el-input-number) {
  flex: 1;
  min-width: 0;
  width: auto;
}
.numeric :deep(.el-input__wrapper) {
  border-radius: 3px 0 0 3px;
}
.numeric :deep(input) {
  text-align: left;
}
.radix {
  width: 80px;
  flex-shrink: 0;
  height: 32px;
  border: 1px solid var(--color-border);
  border-left: 0;
  border-radius: 0 3px 3px 0;
  padding-left: 10px;
  background: var(--color-panel);
  color: var(--color-text);
}
.reference-control {
  position: relative;
}
.reference-control > span {
  position: absolute;
  left: 274px;
  top: 6px;
}
.reference-picker {
  border: 0;
  background: transparent;
  color: var(--color-muted);
  padding: 0 3px;
  font-size: 18px;
}
.field-error {
  grid-column: 4;
  color: var(--color-error);
  font-size: 12px;
}
.no-fields {
  color: var(--color-muted);
  font-size: 13px;
  margin: 24px;
}
:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  border-radius: 3px;
  min-height: 32px;
}
:deep(.el-switch) {
  height: 32px;
  --el-switch-off-color: var(--color-border);
}
@media (max-width: 1200px) {
  .parameter-row {
    grid-template-columns: 18px minmax(130px, 1fr) 18px 240px;
    padding-left: 0;
  }
  .field-control {
    width: 240px;
  }
  .reference-control > span {
    left: 244px;
  }
}
</style>
