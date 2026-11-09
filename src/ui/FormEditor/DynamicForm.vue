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
          'is-multivalue': isMultiValue(param),
          'selected-field': selectedFieldUuid === param.uuid,
          'has-error': Boolean(fieldErrors[param.uuid]),
        }"
        :data-field="param.uuid"
        @click="emit('field-help', param.uuid)"
      >
        <template v-if="isMultiValue(param)">
          <span class="optional-space" />
          <div class="multivalue-block">
            <button class="parameter-name" type="button" :title="param.shortName" :aria-label="'查看 ' + param.shortName + ' 说明'">
              {{ param.shortName }}
              <small class="multivalue-count">{{ multiRows(param).length }}/{{ multiUpper(param) }}</small>
            </button>
            <div
              v-for="(row, rowIndex) in multiRows(param)"
              :key="param.uuid + '#' + rowIndex"
              class="multivalue-row"
            >
              <div class="field-control">
                <el-input
                  :id="'input-' + param.uuid + '-' + rowIndex"
                  :aria-label="param.shortName + ' 第 ' + (rowIndex + 1) + ' 行'"
                  :model-value="typeof row === 'string' ? row : ''"
                  :disabled="readonly || param.readOnly"
                  @update:model-value="editMultiRow(param, rowIndex, $event)"
                />
                <button
                  class="row-remove"
                  type="button"
                  :aria-label="'删除 ' + param.shortName + ' 第 ' + (rowIndex + 1) + ' 行'"
                  :disabled="readonly || param.readOnly || Boolean(rowRemovalBlocked(param))"
                  :title="rowRemovalBlocked(param) || '删除该行'"
                  @click.stop="emit('parameter-row-remove', param.uuid, rowIndex)"
                >
                  ×
                </button>
              </div>
            </div>
            <p v-if="!multiRows(param).length" class="multivalue-empty">--</p>
            <button
              class="row-add"
              type="button"
              :aria-label="'追加 ' + param.shortName + ' 行'"
              :disabled="readonly || param.readOnly || Boolean(rowAddBlocked(param))"
              :title="rowAddBlocked(param) || '追加一行'"
              @click.stop="emit('parameter-row-add', param.uuid)"
            >
              ＋ 追加一行
            </button>
          </div>
        </template>
        <template v-else>
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
        <button
          class="parameter-name"
          type="button"
          :title="param.shortName"
          :aria-label="'查看 ' + param.shortName + ' 说明'"
        >
          {{ param.shortName }}
        </button>
        <FieldState
          :configured="configuredFields[param.uuid] === true"
          :optional="Boolean(param.isOptional)"
          :has-default="param.defaultValue !== undefined || param.type === 'BOOLEAN'"
          :message="fieldErrors[param.uuid]"
        />
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
              :disabled="rowDisabled(param)"
              @update:model-value="editHex(param, $event)"
            />
            <el-input
              v-else-if="invalidNumeric(param)"
              :id="'input-' + param.uuid"
              :aria-label="param.shortName"
              :model-value="String(rawValue(param) ?? '')"
              :disabled="rowDisabled(param)"
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
              :disabled="rowDisabled(param)"
              @update:model-value="onValueChange(param.uuid, $event)"
            />
            <select
              class="radix"
              :aria-label="param.shortName + ' 进制'"
              :value="radices[param.uuid] ?? 'DEC'"
              :disabled="rowDisabled(param)"
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
            :disabled="rowDisabled(param)"
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
            :disabled="rowDisabled(param)"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
          <el-input
            v-else
            :id="'input-' + param.uuid"
            :aria-label="param.shortName"
            :model-value="stringValue(param)"
            :disabled="rowDisabled(param)"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
        </div>
        <span v-if="numericErrors[param.uuid]" class="field-error" role="alert">{{
          numericErrors[param.uuid]
        }}</span>
        <span v-if="fieldErrors[param.uuid]" class="field-error" role="alert">{{
          fieldErrors[param.uuid]
        }}</span>
        </template>
        <p v-if="rowNotice(param)" class="row-notice" role="note" data-row-notice>
          {{ rowNotice(param) }}
        </p>
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
          'has-error': Boolean(fieldErrors[reference.uuid]),
        }"
        :data-field="reference.uuid"
        @click="emit('field-help', reference.uuid)"
      >
        <span class="optional-space" />
        <button
          class="parameter-name"
          type="button"
          :title="reference.shortName"
          :aria-label="'查看 ' + reference.shortName + ' 说明'"
        >
          {{ reference.shortName }}
        </button>
        <FieldState
          :configured="configuredFields[reference.uuid] === true"
          :optional="Boolean(reference.isOptional)"
          :message="fieldErrors[reference.uuid]"
        />
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
              @click="openReference(reference.uuid)"
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
        <span v-if="fieldErrors[reference.uuid]" class="field-error" role="alert">{{
          fieldErrors[reference.uuid]
        }}</span>
      </div>
    </section>
    <p v-if="!container.parameters.length && !container.references.length" class="no-fields">
      该容器没有可配置的字段
    </p>
    <el-dialog
      :model-value="Boolean(referencePicker)"
      :title="(activeReference?.shortName ?? '') + ' 引用配置'"
      width="min(640px, 94vw)"
      @close="referencePicker = undefined"
    >
      <template v-if="referencePicker">
        <el-input
          v-model="referenceSearch"
          aria-label="搜索引用目标"
          placeholder="搜索实例名称或路径"
          clearable
        />
        <div class="reference-candidates" role="radiogroup" aria-label="引用目标">
          <label class="reference-candidate" :class="{ picked: !referenceDraft && !createDraft }">
            <input
              type="radio"
              name="reference-target"
              :checked="!referenceDraft && !createDraft"
              @change="stageReference('')"
            />
            <span>不选择目标（清除引用）</span>
          </label>
          <label
            v-for="option in filteredReferences"
            :key="option.uuid"
            class="reference-candidate"
            :class="{ picked: referenceDraft === option.uuid && !createDraft }"
          >
            <input
              type="radio"
              name="reference-target"
              :aria-label="option.label"
              :checked="referenceDraft === option.uuid && !createDraft"
              @change="stageReference(option.uuid)"
            />
            <span
              ><strong>{{ option.label.split('/').pop() }}</strong
              ><small>{{ option.label }}</small></span
            >
          </label>
          <p v-if="referenceSearch && !filteredReferences.length">没有匹配的实例</p>
        </div>
        <p v-if="createDraft" role="status">
          确定后创建并引用：{{ createDraft.label }}；取消不会创建。
        </p>
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
            @click="createDraft = option"
            >新增 {{ option.label }}</el-button
          >
          <p v-if="!referenceAddOptions[referencePicker]?.length">
            请先新增目标父容器；跨模块目标当前不可创建。
          </p>
        </div>
      </template>
      <template #footer>
        <el-button @click="referencePicker = undefined">取消</el-button>
        <el-button type="primary" :disabled="!canApplyReference" @click="applyReference"
          >确定</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';
import FieldState from './FieldState.vue';
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
    configuredFields?: Record<string, boolean>;
    fieldErrors?: Record<string, string>;
    /** G39: per-row disabled state + business notice, computed by the store. */
    parameterStates?: Record<string, { disabled?: boolean; notice?: string }>;
  }>(),
  {
    configData: () => ({}),
    referenceData: () => ({}),
    referenceOptions: () => ({}),
    referenceAddOptions: () => ({}),
    readonly: false,
    danglingReferences: () => [],
    configuredFields: () => ({}),
    fieldErrors: () => ({}),
  }
);
const emit = defineEmits<{
  'field-help': [fieldUuid: string];
  'update:configData': [data: Record<string, unknown>];
  'parameter-change': [paramUuid: string, value: unknown];
  'parameter-row-add': [paramUuid: string];
  'parameter-row-remove': [paramUuid: string, rowIndex: number];
  'reference-change': [refUuid: string, targetUuid: string];
  'create-reference-target': [refUuid: string, definitionUuid: string, parentUuid: string | null];
}>();
// G32: a multi-value parameter exposes its rows through configData as an array.
function isMultiValue(parameter: BswmdParameter): boolean {
  const upper = parameter.multiplicity?.upper;
  return upper !== undefined && (upper === 'unbounded' || upper > 1);
}
function multiRows(parameter: BswmdParameter): unknown[] {
  const value = props.configData[parameter.uuid];
  return Array.isArray(value) ? value : [];
}
function multiUpper(parameter: BswmdParameter): string {
  const upper = parameter.multiplicity?.upper;
  return upper === undefined ? '?' : String(upper);
}
function rowAddBlocked(parameter: BswmdParameter): string | undefined {
  const upper = parameter.multiplicity?.upper;
  if (typeof upper === 'number' && multiRows(parameter).length >= upper)
    return `已到上限 ${upper}`;
  return undefined;
}
function rowRemovalBlocked(parameter: BswmdParameter): string | undefined {
  const lower = parameter.multiplicity?.lower;
  if (typeof lower === 'number' && multiRows(parameter).length <= lower)
    return `下限要求至少 ${lower} 行`;
  return undefined;
}
function editMultiRow(parameter: BswmdParameter, rowIndex: number, value: string): void {
  const rows = [...multiRows(parameter)];
  rows[rowIndex] =
    parameter.type === 'INTEGER'
      ? Number.isSafeInteger(Number(value)) && value.trim() !== ''
        ? Number(value)
        : value
      : parameter.type === 'FLOAT'
        ? Number.isFinite(Number(value)) && value.trim() !== ''
          ? Number(value)
          : value
        : value;
  emit('parameter-change', parameter.uuid, rows);
}
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
const referenceDraft = ref('');
const referenceSearch = ref('');
const createDraft = ref<{
  definitionUuid: string;
  parentUuid: string | null;
  label: string;
  disabledReason?: string;
}>();
const activeReference = computed(() =>
  props.container.references.find((ref) => ref.uuid === referencePicker.value)
);
const filteredReferences = computed(() =>
  (props.referenceOptions[referencePicker.value ?? ''] ?? []).filter((option) =>
    option.label.toLowerCase().includes(referenceSearch.value.trim().toLowerCase())
  )
);
const canApplyReference = computed(
  () =>
    !props.readonly &&
    activeReference.value &&
    !activeReference.value.isExternal &&
    (createDraft.value
      ? (props.referenceAddOptions[referencePicker.value ?? ''] ?? []).some(
          (option) =>
            option.definitionUuid === createDraft.value!.definitionUuid &&
            option.parentUuid === createDraft.value!.parentUuid &&
            !option.disabledReason
        )
      : !referenceDraft.value ||
        (props.referenceOptions[referencePicker.value ?? ''] ?? []).some(
          (option) => option.uuid === referenceDraft.value
        ))
);
function openReference(uuid: string): void {
  if (props.readonly || props.container.references.find((ref) => ref.uuid === uuid)?.isExternal)
    return;
  referenceDraft.value = props.referenceData[uuid] ?? '';
  referenceSearch.value = '';
  createDraft.value = undefined;
  referencePicker.value = uuid;
}
function stageReference(uuid: string): void {
  referenceDraft.value = uuid;
  createDraft.value = undefined;
}
function applyReference(): void {
  if (!referencePicker.value || !canApplyReference.value) return;
  if (createDraft.value)
    emit(
      'create-reference-target',
      referencePicker.value,
      createDraft.value.definitionUuid,
      createDraft.value.parentUuid
    );
  else emit('reference-change', referencePicker.value, referenceDraft.value);
  referencePicker.value = undefined;
}
// A history replay, external edit or selection change invalidates an open draft; cancellation writes nothing.
watch(
  () => [props.container.uuid, props.readonly, props.referenceData],
  () => {
    referencePicker.value = undefined;
  },
  { deep: true }
);
function rawValue(parameter: BswmdParameter): unknown {
  // Explicit undefined means an unchecked optional field, not a request to restore the default.
  return Object.prototype.hasOwnProperty.call(props.configData, parameter.uuid)
    ? props.configData[parameter.uuid]
    : parameter.defaultValue;
}
/** G39: a row is locked when read-only, when the optional parameter is unticked,
 * or when the declared row-state channel disables it. */
function rowDisabled(parameter: BswmdParameter): boolean {
  return (
    props.readonly ||
    Boolean(parameter.readOnly) ||
    !enabled(parameter) ||
    Boolean(props.parameterStates?.[parameter.uuid]?.disabled)
  );
}
function rowNotice(parameter: BswmdParameter): string | undefined {
  return props.parameterStates?.[parameter.uuid]?.notice;
}
function enabled(parameter: BswmdParameter): boolean {
  // Suggested defaults are not enabled optional fields until the user confirms them.
  if (
    parameter.isOptional &&
    Object.prototype.hasOwnProperty.call(props.configuredFields, parameter.uuid)
  )
    return props.configuredFields[parameter.uuid];
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
  grid-template-columns: 20px minmax(170px, 245px) 76px 270px;
  align-items: center;
  min-height: 53px;
  gap: 8px;
  padding-left: 16px;
}
.row-notice {
  grid-column: 1 / -1;
  margin: -4px 0 6px;
  font-size: 12px;
  color: var(--color-muted);
}
.row-notice::before {
  content: 'ⓘ ';
}
.parameter-name {
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.parameter-name:focus-visible {
  outline: 1px solid var(--color-accent);
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
.has-error > .parameter-name {
  color: var(--color-error);
}
.reference-candidates {
  max-height: 300px;
  overflow: auto;
  margin-top: 12px;
}
.reference-candidate {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  margin: 4px 0;
  cursor: pointer;
}
.reference-candidate.picked {
  background: var(--color-selected);
  border-color: var(--color-accent);
}
.reference-candidate span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.reference-candidate small {
  display: block;
  color: var(--color-muted);
  margin-top: 4px;
}
.no-fields {
  color: var(--color-muted);
  font-size: 13px;
  margin: 24px;
}
.is-multivalue {
  grid-template-columns: 1fr;
  row-gap: 6px;
}
.multivalue-block {
  min-width: 0;
}
.multivalue-count {
  color: var(--color-muted);
  font-size: 11px;
  margin-left: 6px;
}
.multivalue-row {
  display: flex;
  gap: 8px;
  margin: 4px 0;
}
.multivalue-row .field-control {
  width: 270px;
  justify-content: flex-start;
}
.multivalue-row :deep(.el-input) {
  flex: 1;
}
.multivalue-empty {
  color: var(--color-muted);
  margin: 4px 0;
}
.row-add,
.row-remove {
  border: 1px solid var(--color-border);
  background: var(--color-panel);
  color: var(--color-text);
  border-radius: 3px;
  padding: 4px 10px;
  font: inherit;
  cursor: pointer;
}
.row-remove {
  padding: 2px 8px;
  color: var(--color-error);
}
.row-add:hover:not(:disabled),
.row-remove:hover:not(:disabled) {
  border-color: var(--color-accent);
}
.row-add:disabled,
.row-remove:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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
    grid-template-columns: 18px minmax(130px, 1fr) 76px 240px;
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
