<template>
  <div class="global-search" @keydown.esc.stop="open = false">
    <input
      v-model="query"
      placeholder="搜索参数、值或实例路径"
      aria-label="全局搜索"
      @focus="open = true"
      @input="open = true"
    />
    <section v-if="open && query.trim()" class="results" aria-label="全局搜索结果">
      <div class="result-heading">
        {{ matches.length }} 条结果
        <button aria-label="关闭搜索结果" @click="open = false">×</button>
      </div>
      <p v-if="!matches.length">没有匹配项</p>
      <section v-for="group in groups" :key="group.uuid">
        <h4>{{ group.name }}</h4>
        <button
          v-for="row in group.rows"
          :key="row.containerUuid + ':' + (row.fieldUuid ?? '')"
          class="search-result"
          @click="choose(row)"
        >
          <SearchHighlight :text="row.path" :query="query" />
          <strong><SearchHighlight :text="row.name" :query="query" /></strong>
          <SearchHighlight :text="row.value" :query="query" />
        </button>
      </section>
      <button v-if="limit < matches.length" @click="limit += 100">显示更多结果</button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfigStore } from '@/stores/configStore';
import {
  buildSearchIndex,
  searchConfigurations,
  type SearchResult,
} from '@/core/search/ConfigSearch';
import SearchHighlight from './SearchHighlight.vue';
const store = useConfigStore();
const emit = defineEmits<{ navigate: [result: SearchResult] }>();
const query = ref(''),
  open = ref(false),
  limit = ref(100);
const index = computed(() => buildSearchIndex(store.configSets, store.modules));
const matches = computed(() => searchConfigurations(index.value, query.value));
const groups = computed(() => {
  const grouped = new Map<string, { uuid: string; name: string; rows: SearchResult[] }>();
  for (const row of matches.value.slice(0, limit.value)) {
    if (!grouped.has(row.setUuid))
      grouped.set(row.setUuid, { uuid: row.setUuid, name: row.setName, rows: [] });
    grouped.get(row.setUuid)!.rows.push(row);
  }
  return [...grouped.values()];
});
watch(query, () => {
  limit.value = 100;
});
async function choose(row: SearchResult): Promise<void> {
  if (store.isImporting) return;
  if (row.setUuid !== store.activeUuid && !(await store.switchConfigSet(row.setUuid))) return;
  store.selectContainer(row.containerUuid, row.fieldUuid);
  emit('navigate', row);
  open.value = false;
}
</script>
<style scoped>
.global-search {
  position: relative;
  width: clamp(190px, 25vw, 380px);
  margin-left: auto;
}
input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 4px 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 4px;
}
.results {
  position: absolute;
  right: 0;
  top: 32px;
  width: min(600px, 80vw);
  max-height: 65vh;
  overflow: auto;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  box-shadow: 0 6px 20px var(--color-shadow);
  z-index: 2200;
}
.result-heading,
h4,
p {
  padding: 10px;
  margin: 0;
}
.result-heading {
  display: flex;
  justify-content: space-between;
}
h4 {
  background: var(--color-panel);
}
button {
  color: var(--color-text);
  background: var(--color-surface);
  border: 0;
  cursor: pointer;
}
.search-result {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 10px;
  text-align: left;
  overflow-wrap: anywhere;
}
.search-result:hover,
.search-result:focus {
  background: var(--color-selected);
}
</style>
