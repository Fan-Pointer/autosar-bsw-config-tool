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
import { computed, h, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import { serializeConfig } from '@/core/io/ConfigJson';
import { choiceImpact } from './choiceImpact';

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
  const previous = JSON.stringify(serializeConfig(store.config!));
  pending.value = true;
  try {
    if (group.subContainers.length) {
      try {
        const impact = choiceImpact(store.entries, group.uuid);
        await ElMessageBox.confirm(
          h('div', { class: 'choice-impact' }, [
            h(
              'p',
              `切换候选将丢失「${group.subContainers.map((child) => child.shortName).join('、')}」的配置。新候选按定义重新创建；不复制不兼容字段。可通过一次撤销恢复。`
            ),
            h(
              'p',
              `将创建：${candidates.value.find((candidate) => candidate.uuid === candidateRef)?.shortName}；替换 ${group.subContainers.length} 个候选分支。`
            ),
            impact.length
              ? h('div', { style: 'max-height:280px;overflow:auto' }, [
                  h(
                    'table',
                    {
                      'aria-label': 'CHOICE 替换预览',
                      style: 'width:100%;font-size:12px;overflow-wrap:anywhere',
                    },
                    [
                      h('thead', [
                        h('tr', [h('th', '字段路径'), h('th', '当前值 / 目标'), h('th', '影响')]),
                      ]),
                      h(
                        'tbody',
                        impact.map((row) =>
                          h('tr', [h('td', row.path), h('td', row.value), h('td', row.effect)])
                        )
                      ),
                    ]
                  ),
                ])
              : h('p', '此候选没有已确认的参数值或引用。'),
          ]),
          '切换 CHOICE 候选',
          {
            type: 'warning',
            confirmButtonText: '确认切换',
            cancelButtonText: '取消',
            customClass: 'choice-preview-dialog',
          }
        );
      } catch {
        return;
      }
    }
    // A modal may outlive a tab change or history replay; apply only to the reviewed selection.
    const current = store.entries.find((item) => item.container.uuid === group.uuid)?.container;
    if (
      store.activeUuid !== setUuid ||
      !current ||
      !store.config ||
      JSON.stringify(serializeConfig(store.config)) !== previous
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
:global(.choice-preview-dialog) {
  width: min(880px, 94vw);
  max-width: 94vw;
}
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
