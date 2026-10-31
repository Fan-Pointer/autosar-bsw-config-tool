<template>
  <div class="dynamic-form">
    <el-form
      :model="configData"
      :label-width="labelWidth"
      label-position="top"
      :disabled="readonly"
      @submit.prevent
    >
      <el-form-item
        v-for="param in container.parameters"
        :id="`field-${param.uuid}`"
        :key="param.uuid"
        :label="param.shortName"
        :required="!param.isOptional"
        :data-field="param.uuid"
      >
        <el-input-number
          v-if="param.type === 'INTEGER' || param.type === 'FLOAT'"
          :model-value="numberValue(param)"
          :min="param.min"
          :max="param.max"
          :step="param.type === 'FLOAT' ? 0.1 : 1"
          :precision="param.type === 'INTEGER' ? 0 : undefined"
          controls-position="right"
          @update:model-value="onValueChange(param.uuid, $event)"
        />
        <el-select
          v-else-if="param.type === 'ENUM'"
          :model-value="stringValue(param)"
          :clearable="param.isOptional"
          @update:model-value="onValueChange(param.uuid, $event)"
        >
          <el-option v-for="value in param.enumValues" :key="value" :label="value" :value="value" />
        </el-select>
        <el-switch
          v-else-if="param.type === 'BOOLEAN'"
          :model-value="rawValue(param) === true"
          @update:model-value="onValueChange(param.uuid, $event)"
        />
        <el-input
          v-else
          :model-value="stringValue(param)"
          @update:model-value="onValueChange(param.uuid, $event)"
        />
        <div v-if="param.description" class="param-help">{{ param.description }}</div>
      </el-form-item>
      <el-form-item
        v-for="reference in container.references"
        :id="`field-${reference.uuid}`"
        :key="reference.uuid"
        :label="reference.shortName"
        :required="!reference.isOptional"
        :data-field="reference.uuid"
      >
        <el-select
          :model-value="referenceData[reference.uuid] || ''"
          clearable
          filterable
          :placeholder="`选择 ${reference.destinationContainerType}`"
          @update:model-value="onReferenceChange(reference.uuid, $event)"
        >
          <el-option
            v-for="target in referenceOptions[reference.uuid] || []"
            :key="target.uuid"
            :label="target.label"
            :value="target.uuid"
          />
        </el-select>
        <div v-if="reference.description" class="param-help">{{ reference.description }}</div>
      </el-form-item>
      <el-empty
        v-if="!container.parameters.length && !container.references.length"
        description="该容器没有可配置的字段"
      />
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';

const props = withDefaults(
  defineProps<{
    container: BswmdContainer;
    configData?: Record<string, unknown>;
    referenceData?: Record<string, string>;
    referenceOptions?: Record<string, { uuid: string; label: string }[]>;
    labelWidth?: string;
    readonly?: boolean;
  }>(),
  {
    configData: () => ({}),
    referenceData: () => ({}),
    referenceOptions: () => ({}),
    labelWidth: '120px',
    readonly: false,
  }
);

const emit = defineEmits<{
  'update:configData': [data: Record<string, unknown>];
  'parameter-change': [paramUuid: string, value: unknown];
  'reference-change': [refUuid: string, targetUuid: string];
}>();

function rawValue(parameter: BswmdParameter): unknown {
  return props.configData[parameter.uuid] ?? parameter.defaultValue;
}
function numberValue(parameter: BswmdParameter): number | undefined {
  const value = rawValue(parameter);
  return typeof value === 'number' ? value : undefined;
}
function stringValue(parameter: BswmdParameter): string {
  const value = rawValue(parameter);
  return typeof value === 'string' ? value : '';
}
function onValueChange(paramUuid: string, value: unknown): void {
  if (props.readonly) return;
  emit('update:configData', { ...props.configData, [paramUuid]: value });
  emit('parameter-change', paramUuid, value);
}
function onReferenceChange(refUuid: string, value: unknown): void {
  if (!props.readonly && typeof value === 'string') emit('reference-change', refUuid, value);
}

/**
 * Return a snapshot without mutating the parent-owned configuration.
 * @returns Current parameter values.
 */
function getFormData(): Record<string, unknown> {
  return { ...props.configData };
}

/**
 * Restore defaults through the same edit events used by the controls.
 * @returns Nothing.
 */
function resetForm(): void {
  if (props.readonly) return;
  const values: Record<string, unknown> = {};
  for (const parameter of props.container.parameters) {
    values[parameter.uuid] = parameter.defaultValue;
    emit('parameter-change', parameter.uuid, parameter.defaultValue);
  }
  emit('update:configData', values);
}

defineExpose({ resetForm, getFormData });
</script>

<style scoped>
.dynamic-form {
  padding: 20px;
}
.param-help {
  font-size: 12px;
  color: #606266;
  margin-top: 4px;
  line-height: 1.4;
  width: 100%;
}
.el-form-item {
  margin-bottom: 18px;
}
.el-input-number,
.el-select,
.el-input {
  width: 100%;
}
</style>
