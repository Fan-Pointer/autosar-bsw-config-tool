<template>
  <section class="field-description" aria-label="参数说明面板">
    <header>
      <strong>{{ field?.shortName ?? '参数说明' }}</strong>
      <button aria-label="收起参数说明" @click="emit('collapse')">收起</button>
    </header>
    <div class="description-content">
      <template v-if="field">
        <p class="description-text">{{ field.description || '此字段未提供说明' }}</p>
        <p class="definition-path">{{ field.definitionPath ?? path }}</p>
        <p v-if="'type' in field">
          类型：{{ field.type }}
          <template v-if="field.min !== undefined || field.max !== undefined">
            · 范围：{{ field.min ?? '不限' }} ～ {{ field.max ?? '不限' }}</template
          >
          <template v-if="field.enumValues?.length">
            · 选项：{{ field.enumValues.join('、') }}</template
          >
        </p>
        <p v-else>
          目标：{{
            field.destinationRefs?.join('、') ||
            field.destinationRef ||
            field.destinationContainerType
          }}
        </p>
      </template>
      <p v-else class="empty-help">点击参数查看说明</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BswmdParameter, BswmdReference } from '@/core/bswmd/BswmdTypes';
defineProps<{ field?: BswmdParameter | BswmdReference; path?: string }>();
const emit = defineEmits<{ collapse: [] }>();
</script>

<style scoped>
.field-description {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  flex-shrink: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
}
strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  background: transparent;
  color: var(--color-accent);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 4px 8px;
  cursor: pointer;
}
.description-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 16px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
p {
  margin: 10px 0;
}
.description-text {
  white-space: pre-wrap;
}
.definition-path,
.empty-help {
  color: var(--color-muted);
}
</style>
