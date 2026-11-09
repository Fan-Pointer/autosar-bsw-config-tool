<template>
  <div class="container-navigator">
    <div class="container-tabs" role="tablist" aria-label="顶级容器">
      <button
        v-for="item in visibleTabs"
        :key="item.uuid"
        role="tab"
        :title="item.shortName"
        :aria-selected="activeId === item.uuid"
        :class="{ active: activeId === item.uuid }"
        @click="choose(item.uuid)"
      >
        {{ item.shortName }}
      </button>
      <el-dropdown v-if="hiddenTabs.length" trigger="click" @command="choose">
        <button class="overflow-tab" aria-label="更多顶级容器">…</button>
        <template #dropdown
          ><el-dropdown-menu
            ><el-dropdown-item v-for="item in hiddenTabs" :key="item.uuid" :command="item.uuid">{{
              item.shortName
            }}</el-dropdown-item></el-dropdown-menu
          ></template
        >
      </el-dropdown>
    </div>
    <div class="tree-tools">
      <button title="实例操作" aria-label="实例操作" @click="emit('actions')">▤</button>
      <button title="未核实，待补充截图" disabled aria-label="上移">↑</button>
      <button title="未核实，待补充截图" disabled aria-label="下移">↓</button>
      <button
        :title="addReason ?? '添加实例：定义节点创建该类实例，实例节点选择子容器'"
        aria-label="添加实例"
        :disabled="!store.config || store.isLoading || store.isImporting || Boolean(addReason)"
        @click="add"
      >
        ＋
      </button>
    </div>
    <div class="tree-search">
      <el-input v-model="query" placeholder="请输入文字搜索" clearable aria-label="搜索配置树"
        ><template #suffix>⌕</template></el-input
      >
    </div>
    <ConfigTree
      mixed
      :module="store.module"
      :config="store.config ?? undefined"
      :definition-id="activeId"
      :query="query"
      :selected-key="store.selectedEntry?.container.uuid"
      :violations="store.violations"
      :selected-uuids="store.selectedContainerUuids"
      @node-click="select"
      @node-contextmenu="context"
    />
    <div class="tree-legend" aria-label="树状态图例">
      <span>已选 {{ store.selectedContainerUuids.length }} 项</span>
      <span><i class="ok" />已配置</span><span><i class="warning" />警告</span
      ><span><i class="error" />错误</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import ConfigTree from './ConfigTree.vue';
import type { ContainerContextTarget } from './containerMenuPosition';
import { useConfigStore } from '@/stores/configStore';
const props = defineProps<{ width: number }>();
const emit = defineEmits<{
  actions: [];
  'add-children': [];
  context: [event: MouseEvent, target: ContainerContextTarget];
  selected: [];
}>();
const store = useConfigStore();
const activeId = ref('');
const query = ref('');
const selectedDefinition = ref<{ uuid: string; parentUuid?: string }>();
const tabs = computed(() => store.module?.containers ?? []);
const tabCount = computed(() => Math.max(1, Math.floor((props.width - 36) / 100)));
const visibleTabs = computed(() => {
  const visible = tabs.value.slice(0, tabCount.value);
  const selected = tabs.value.find((item) => item.uuid === activeId.value);
  if (selected && !visible.includes(selected)) visible[visible.length - 1] = selected;
  return visible;
});
const hiddenTabs = computed(() => tabs.value.filter((item) => !visibleTabs.value.includes(item)));
const addDefinition = computed(
  () => selectedDefinition.value ?? (store.selectedEntry ? undefined : { uuid: activeId.value })
);
const addReason = computed(() => {
  const target = addDefinition.value;
  if (!target?.uuid) return store.childOptions.length ? undefined : '没有可添加的子容器';
  const option = store
    .addOptionsFor('parentUuid' in target ? (target.parentUuid ?? null) : null)
    .find((item) => item.definition.uuid === target.uuid);
  return option?.disabledReason ?? (option ? undefined : '当前父容器不允许添加该定义');
});
watch(
  () => store.activeUuid,
  () => {
    activeId.value = tabs.value[0]?.uuid ?? '';
    query.value = '';
    selectedDefinition.value = undefined;
  },
  { immediate: true }
);
watch(
  () => store.selectedEntry?.container.uuid,
  () => {
    if (!store.selectedEntry) return;
    selectedDefinition.value = undefined;
    // A diagnostic can select a nested instance outside the currently visible root tab.
    const root = store.entries.find(
      (item) => item.path === store.selectedEntry?.path.split('/')[0]
    );
    if (root) activeId.value = root.definition.uuid;
  }
);
function choose(uuid: string): void {
  activeId.value = uuid;
  query.value = '';
  selectedDefinition.value = { uuid };
  const first = store.config?.containers.find((item) => item.definitionRef === uuid);
  store.selectContainer(first?.uuid ?? '');
  emit('selected');
}
function select(
  node: {
    type: string;
    definitionRef?: string;
    containerUuid?: string;
    parentUuid?: string;
  },
  event?: MouseEvent,
  visible: string[] = []
): void {
  if (node.type === 'definition' && node.definitionRef) {
    selectedDefinition.value = { uuid: node.definitionRef, parentUuid: node.parentUuid };
  } else if (node.containerUuid) {
    store.selectContainers(
      node.containerUuid,
      Boolean(event?.ctrlKey || event?.metaKey),
      Boolean(event?.shiftKey),
      visible
    );
    selectedDefinition.value = undefined;
  }
  emit('selected');
}
function context(
  event: MouseEvent,
  node: { type: string; containerUuid?: string; parentUuid?: string; definitionRef?: string }
): void {
  // Context actions carry their own target; opening a menu must not retarget the form.
  emit('context', event, {
    type: node.type === 'definition' ? 'definition' : 'instance',
    containerUuid: node.containerUuid,
    definitionRef: node.definitionRef,
  });
}
async function add(): Promise<void> {
  const target = addDefinition.value;
  if (!target?.uuid) {
    emit('add-children');
    return;
  }
  try {
    store.addContainerInstance(target.uuid, target.parentUuid ?? null);
    selectedDefinition.value = undefined;
    await store.saveConfig();
    emit('selected');
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
</script>
<style scoped>
.container-navigator {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.container-tabs {
  height: 46px;
  flex-shrink: 0;
  display: flex;
  border-bottom: 1px solid var(--color-border);
}
.container-tabs > button {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button {
  border: 0;
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  font-size: 13px;
}
.container-tabs > button.active {
  color: var(--color-accent);
  border-bottom: 2px solid var(--color-accent);
}
.overflow-tab {
  height: 45px;
  width: 34px;
}
.tree-tools {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px;
}
.tree-tools button {
  width: 24px;
  height: 24px;
  color: var(--color-muted);
  font-size: 17px;
}
.tree-tools button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tree-search {
  padding: 4px 9px 10px;
}
.tree-search :deep(.el-input__wrapper) {
  height: 26px;
  min-height: 26px;
  border-radius: 2px;
}
.tree-search :deep(input) {
  height: 24px;
  font-size: 12px;
}
.config-tree {
  flex: 1;
  min-height: 0;
  padding: 0 5px;
}
.tree-legend {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  font-size: 11px;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
}
.tree-legend i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 3px;
  border-radius: 50%;
}
.ok {
  background: var(--color-success);
}
.warning {
  background: var(--color-warning);
}
.error {
  background: var(--color-error);
}

</style>
