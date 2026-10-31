<template>
  <section v-if="entry?.definition.choice" class="choice-selector" aria-label="CHOICE 候选选择">
    <p>选择一个候选：{{ selected?.shortName ?? '尚未选择（导出前必选）' }}</p>
    <div class="choices">
      <el-button
        v-for="candidate in candidates"
        :key="candidate.uuid"
        :aria-label="'选择候选 ' + candidate.shortName"
        :aria-pressed="selected?.definitionRef === candidate.uuid"
        :type="selected?.definitionRef === candidate.uuid ? 'primary' : 'default'"
        :disabled="
          pending || store.isLoading || store.isImporting || candidate.multiplicity.upper === 0
        "
        :title="candidate.description"
        @click="choose(candidate.uuid)"
        >{{ candidate.shortName }}</el-button
      >
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';

const store = useConfigStore();
const pending = ref(false);
const entry = computed(() => store.selectedEntry);
const selected = computed(() => entry.value?.container.subContainers[0]);
const candidates = computed(
  () =>
    entry.value?.definition.subContainers.filter((candidate) =>
      entry.value?.definition.choice?.candidateRefs.includes(candidate.uuid)
    ) ?? []
);

async function choose(candidateRef: string): Promise<void> {
  const group = entry.value?.container;
  const setUuid = store.activeUuid;
  if (!group || selected.value?.definitionRef === candidateRef) return;
  const previous = group.subContainers.map((child) => child.uuid).join(',');
  pending.value = true;
  try {
    if (group.subContainers.length) {
      try {
        await ElMessageBox.confirm(
          `切换候选将丢失「${group.subContainers.map((child) => child.shortName).join('、')}」的配置。可通过一次撤销恢复。`,
          '切换 CHOICE 候选',
          { type: 'warning', confirmButtonText: '确认切换', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
    }
    // A modal may outlive a tab change or history replay; apply only to the reviewed selection.
    const current = store.entries.find((item) => item.container.uuid === group.uuid)?.container;
    if (
      store.activeUuid !== setUuid ||
      current?.subContainers.map((child) => child.uuid).join(',') !== previous
    )
      throw new Error('配置已变化，请重新选择候选');
    store.selectChoice(group.uuid, candidateRef);
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  } finally {
    pending.value = false;
  }
}
</script>

<style scoped>
.choice-selector {
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.choices .el-button {
  margin-left: 0;
}
</style>
