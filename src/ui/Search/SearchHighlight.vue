<template>
  <span
    ><template v-for="(part, index) in parts" :key="index"
      ><mark v-if="part.match">{{ part.text }}</mark
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ text: string; query: string }>();
const parts = computed(() => {
  const needle = props.query.trim().toLocaleLowerCase(),
    text = props.text;
  if (!needle) return [{ text, match: false }];
  const result: { text: string; match: boolean }[] = [];
  let offset = 0,
    at = text.toLocaleLowerCase().indexOf(needle);
  while (at >= 0) {
    result.push(
      { text: text.slice(offset, at), match: false },
      { text: text.slice(at, at + needle.length), match: true }
    );
    offset = at + needle.length;
    at = text.toLocaleLowerCase().indexOf(needle, offset);
  }
  result.push({ text: text.slice(offset), match: false });
  return result;
});
</script>
<style scoped>
mark {
  background: var(--color-highlight);
  color: var(--color-text);
}
</style>
