<template>
  <details class="reference-relations" aria-label="实例引用关系">
    <summary>引用关系 · 入站 {{ incoming.length }} / 出站 {{ outgoing.length }}</summary>
    <h4>入站：引用此实例的位置</h4>
    <p v-if="!incoming.length">暂无入站引用</p>
    <ul>
      <li v-for="link in incoming" :key="link.sourceUuid + link.fieldUuid">
        <button @click="emit('navigate', link.sourceUuid, link.fieldUuid)">
          {{ link.sourcePath }} / {{ link.name }}
        </button>
      </li>
    </ul>
    <h4>出站：此实例的引用目标</h4>
    <p v-if="!outgoing.length">此实例没有引用定义</p>
    <ul>
      <li v-for="link in outgoing" :key="link.fieldUuid">
        <span>{{ link.name }} → </span
        ><button v-if="link.target" @click="emit('navigate', link.target.container.uuid)">
          {{ link.target.path }}</button
        ><span v-else>{{ link.status }}</span>
      </li>
    </ul>
  </details>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useConfigStore } from '@/stores/configStore';
const store = useConfigStore();
const emit = defineEmits<{ navigate: [uuid: string, fieldUuid?: string] }>();
const incoming = computed(() =>
  store.entries.flatMap((entry) =>
    entry.definition.references.flatMap((definition) => {
      const value = entry.container.references.get(definition.uuid);
      return value?.isConfigured && value.targetUuid === store.selectedEntry?.container.uuid
        ? [
            {
              sourceUuid: entry.container.uuid,
              sourcePath: entry.path,
              fieldUuid: definition.uuid,
              name: definition.shortName,
            },
          ]
        : [];
    })
  )
);
const outgoing = computed(() =>
  (store.selectedEntry?.definition.references ?? []).map((definition) => {
    const value = store.selectedEntry?.container.references.get(definition.uuid);
    return {
      fieldUuid: definition.uuid,
      name: definition.shortName,
      target:
        !definition.isExternal && value?.isConfigured
          ? store.entries.find((entry) => entry.container.uuid === value.targetUuid)
          : undefined,
      status: definition.isExternal
        ? '跨模块（本期不支持）'
        : !value?.isConfigured || !value.targetUuid
          ? '未选择目标'
          : `目标不存在（${value.targetUuid}）`,
    };
  })
);
</script>
<style scoped>
.reference-relations {
  margin: 20px 22px;
  border-top: 1px solid var(--color-border);
  padding: 16px 0;
  font-size: 13px;
}
summary {
  cursor: pointer;
  color: var(--color-text);
}
h4 {
  margin: 16px 0 8px;
}
ul {
  padding-left: 20px;
}
li {
  margin: 8px 0;
  overflow-wrap: anywhere;
}
button {
  border: 0;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  text-align: left;
  overflow-wrap: anywhere;
}
p {
  color: var(--color-muted);
}
</style>
