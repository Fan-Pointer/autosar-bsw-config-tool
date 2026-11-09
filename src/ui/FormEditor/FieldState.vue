<template>
  <span class="field-state" :class="state" :data-state="state" :title="message">
    {{
      state === 'error'
        ? '● 错误'
        : state === 'configured'
          ? '☑ 已配置'
          : state === 'optional'
            ? '☐ 可选'
            : state === 'default'
              ? '默认值'
              : '⚠ 未确认'
    }}
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{
  configured: boolean;
  optional: boolean;
  hasDefault?: boolean;
  message?: string;
}>();
// Presentation only: error reasons come from the shared validator, never a second rule engine.
const state = computed(() =>
  props.configured
    ? props.message
      ? 'error'
      : 'configured'
    : props.optional
      ? 'optional'
      : props.hasDefault && !props.message
        ? 'default'
        : 'unconfirmed'
);
</script>
<style scoped>
.field-state {
  font-size: 11px;
  white-space: nowrap;
  color: var(--color-muted);
}
.configured {
  color: var(--color-success);
}
.unconfirmed {
  color: var(--color-warning);
}
.default {
  color: var(--color-muted);
}
.error {
  color: var(--color-error);
  font-weight: 600;
}
</style>
