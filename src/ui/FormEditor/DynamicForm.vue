<template>
  <div class="dynamic-form">
    <el-form
      :model="formData"
      :label-width="labelWidth"
      label-position="top"
      @submit.prevent
    >
      <template v-for="param in visibleParameters" :key="param.uuid">
        <!-- INTEGER / FLOAT 类型 -->
        <el-form-item
          v-if="isNumberType(param.type)"
          :label="param.shortName"
          :required="!param.isOptional"
        >
          <el-input-number
            :model-value="formData[param.uuid]"
            :min="param.min"
            :max="param.max"
            :step="param.type === 'FLOAT' ? 0.1 : 1"
            controls-position="right"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
          <div v-if="param.description" class="param-help">{{ param.description }}</div>
        </el-form-item>

        <!-- ENUM 类型 -->
        <el-form-item
          v-else-if="param.type === 'ENUM'"
          :label="param.shortName"
          :required="!param.isOptional"
        >
          <el-select
            :model-value="formData[param.uuid]"
            clearable
            @update:model-value="onValueChange(param.uuid, $event)"
          >
            <el-option
              v-for="val in param.enumValues"
              :key="val"
              :label="val"
              :value="val"
            />
          </el-select>
          <div v-if="param.description" class="param-help">{{ param.description }}</div>
        </el-form-item>

        <!-- BOOLEAN 类型 -->
        <el-form-item
          v-else-if="param.type === 'BOOLEAN'"
          :label="param.shortName"
        >
          <el-switch
            :model-value="formData[param.uuid]"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
          <div v-if="param.description" class="param-help">{{ param.description }}</div>
        </el-form-item>

        <!-- STRING / FUNCTION / 其他 -->
        <el-form-item
          v-else
          :label="param.shortName"
          :required="!param.isOptional"
        >
          <el-input
            :model-value="formData[param.uuid]"
            :placeholder="param.defaultValue !== undefined ? String(param.defaultValue) : ''"
            @update:model-value="onValueChange(param.uuid, $event)"
          />
          <div v-if="param.description" class="param-help">{{ param.description }}</div>
        </el-form-item>
      </template>

      <el-empty v-if="visibleParameters.length === 0" description="该容器没有可配置的参数" />
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BswmdContainer, BswmdParameter } from '@/core/bswmd/BswmdTypes';

interface Props {
  /** 容器定义（来自 BSWMD） */
  container: BswmdContainer;
  /** 当前参数值（来自配置实例） */
  configData?: Record<string, unknown>;
  /** 表单标签宽度 */
  labelWidth?: string;
  /** 是否只读 */
  readonly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  configData: () => ({}),
  labelWidth: '120px',
  readonly: false
});

const emit = defineEmits<{
  'update:configData': [data: Record<string, unknown>];
  'parameter-change': [paramUuid: string, value: unknown];
}>();

const formData = ref<Record<string, unknown>>(props.configData);

/**
 * 可见参数列表（可在此处扩展过滤逻辑）
 */
const visibleParameters = computed(() => props.container.parameters);

/**
 * 判断是否为数值类型
 */
function isNumberType(type: string): boolean {
  return type === 'INTEGER' || type === 'FLOAT';
}

/**
 * 参数值变化处理
 */
function onValueChange(paramUuid: string, value: unknown): void {
  formData.value[paramUuid] = value;
  emit('update:configData', { ...formData.value });
  emit('parameter-change', paramUuid, value);
}

/**
 * 暴露方法：重置表单
 */
function resetForm(): void {
  formData.value = {};
  emit('update:configData', {});
}

/**
 * 暴露方法：获取表单数据
 */
function getFormData(): Record<string, unknown> {
  return { ...formData.value };
}

defineExpose({ resetForm, getFormData });
</script>

<style scoped>
.dynamic-form {
  padding: 20px;
}

.param-help {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
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
