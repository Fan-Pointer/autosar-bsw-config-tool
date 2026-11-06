<template>
  <div
    ref="panel"
    class="container-context-menu floating-menu"
    :class="{ 'child-menu': childrenOpen }"
    :style="{ left: position.left + 'px', top: position.top + 'px' }"
    role="menu"
    :aria-label="childrenOpen ? '新建子容器' : '容器操作'"
    tabindex="-1"
    @click.stop
    @contextmenu.prevent.stop
    @keydown.stop="onKey"
  >
    <template v-if="childrenOpen">
      <button
        role="menuitem"
        tabindex="-1"
        class="menu-back"
        aria-label="返回容器操作"
        title="返回"
        @click="back"
      >
        ‹
      </button>
      <p v-if="!actions.childOptions.length" class="menu-empty">此容器没有子定义</p>
      <button
        v-for="option in actions.childOptions"
        :key="option.definition.uuid"
        role="menuitem"
        tabindex="-1"
        :data-definition-id="option.definition.uuid"
        :aria-disabled="Boolean(actions.editReason || option.disabledReason)"
        :title="actions.editReason || option.disabledReason || option.definition.shortName"
        :aria-description="actions.editReason || option.disabledReason"
        @click="add(option.definition.uuid)"
      >
        {{ option.definition.shortName }}
      </button>
    </template>
    <template v-else>
      <button
        role="menuitem"
        tabindex="-1"
        aria-haspopup="menu"
        :aria-disabled="Boolean(targetReason)"
        :title="targetReason"
        :aria-description="targetReason"
        @click="openChildren"
      >
        新建实例<span class="menu-arrow" aria-hidden="true">›</span>
      </button>
      <button
        role="menuitem"
        tabindex="-1"
        :aria-disabled="Boolean(cloneReason)"
        :title="cloneReason"
        :aria-description="cloneReason"
        @click="clone"
      >
        克隆实例
      </button>
      <button
        role="menuitem"
        tabindex="-1"
        :aria-disabled="Boolean(removalReason)"
        :title="removalReason"
        :aria-description="removalReason"
        @click="remove"
      >
        删除实例
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useConfigStore } from '@/stores/configStore';
import { placeContainerMenu, type ContainerContextTarget } from './containerMenuPosition';

const props = defineProps<{
  target: ContainerContextTarget;
  x: number;
  y: number;
  returnFocus?: HTMLElement;
}>();
const emit = defineEmits<{ close: [] }>();
const store = useConfigStore();
const panel = ref<HTMLElement>();
const childrenOpen = ref(false);
const position = ref({ left: 8, top: 8 });
const origin = ref({ left: 8, top: 8, width: 0 });
const configUuid = store.activeUuid;
const actions = computed(() =>
  store.containerActionsFor(
    props.target.type === 'instance' ? props.target.containerUuid : undefined
  )
);
const definitionReason = computed(() =>
  props.target.type === 'definition' ? '请右键实例节点' : undefined
);
const targetReason = computed(() => definitionReason.value || actions.value.editReason);
const cloneReason = computed(() => targetReason.value || actions.value.cloneReason);
const removalReason = computed(() => targetReason.value || actions.value.removalReason);

function close(restoreFocus = false): void {
  const target = props.returnFocus;
  emit('close');
  if (restoreFocus) void nextTick(() => target?.isConnected && target.focus());
}
function focusItem(last = false): void {
  // Disabled actions remain keyboard discoverable; action guards still reject all writes.
  const items = panel.value?.querySelectorAll<HTMLButtonElement>('button');
  (items?.[last ? items.length - 1 : 0] ?? panel.value)?.focus();
}
async function reposition(): Promise<void> {
  await nextTick();
  if (!panel.value) return;
  const size = panel.value.getBoundingClientRect();
  const anchor = childrenOpen.value
    ? { x: origin.value.left + origin.value.width, y: origin.value.top, left: origin.value.left }
    : { x: props.x, y: props.y };
  position.value = placeContainerMenu(anchor, size, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
}
async function openChildren(): Promise<void> {
  if (targetReason.value || !panel.value) return;
  const rect = panel.value.getBoundingClientRect();
  origin.value = { left: position.value.left, top: position.value.top, width: rect.width };
  // Only one panel stays mounted: the parent actions cannot overlay the child list or a dialog.
  childrenOpen.value = true;
  await reposition();
  focusItem();
}
async function back(): Promise<void> {
  childrenOpen.value = false;
  await reposition();
  focusItem();
}
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault();
    close(event.key === 'Escape');
    return;
  }
  if (event.key === 'ArrowLeft' && childrenOpen.value) {
    event.preventDefault();
    void back();
    return;
  }
  if (event.key === 'ArrowRight' && !childrenOpen.value) {
    event.preventDefault();
    void openChildren();
    return;
  }
  const items = [...(panel.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (items[index]?.getAttribute('aria-disabled') !== 'true') items[index]?.click();
  }
}
function outside(event: Event): void {
  if (event.target instanceof Node && !panel.value?.contains(event.target)) close();
}
async function perform(action: () => unknown): Promise<void> {
  close();
  try {
    if (store.activeUuid !== configUuid) return;
    action();
    await store.saveConfig();
  } catch (reason) {
    ElMessage.error(reason instanceof Error ? reason.message : String(reason));
  }
}
async function add(uuid: string): Promise<void> {
  if (
    targetReason.value ||
    actions.value.childOptions.find((item) => item.definition.uuid === uuid)?.disabledReason
  )
    return;
  const parentUuid = props.target.containerUuid;
  if (parentUuid) await perform(() => store.addContainerInstance(uuid, parentUuid));
}
async function clone(): Promise<void> {
  if (cloneReason.value) return;
  const uuid = props.target.containerUuid;
  await perform(() => store.cloneContainerInstance(uuid));
}
async function remove(): Promise<void> {
  if (removalReason.value || !actions.value.entry) return;
  const { uuid, shortName } = actions.value.entry.container;
  close();
  // Let Vue remove the entire menu before opening a modal; keep the target across the await.
  await nextTick();
  try {
    await ElMessageBox.confirm(`删除实例「${shortName}」及其子项？`, '删除实例', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  await perform(() => store.removeContainerInstance(uuid));
}
watch(
  () => [props.x, props.y, props.target],
  async () => {
    childrenOpen.value = false;
    await reposition();
    focusItem();
  }
);
onMounted(async () => {
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('click', outside, true);
  window.addEventListener('resize', reposition);
  await reposition();
  focusItem();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('click', outside, true);
  window.removeEventListener('resize', reposition);
});
</script>

<style scoped>
.container-context-menu {
  position: fixed;
  z-index: 2100;
  box-sizing: border-box;
  width: 180px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 6px 20px #0003;
  font-size: 13px;
}
.child-menu {
  width: 360px;
}
button {
  display: block;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 3px;
  text-align: left;
  font: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
button:hover:not([aria-disabled='true']),
button:focus-visible {
  background: var(--color-selected);
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
button[aria-disabled='true'] {
  color: var(--color-muted);
  cursor: not-allowed;
  opacity: 0.6;
}
.menu-arrow {
  margin-left: auto;
  float: right;
}
.menu-back {
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
}
.menu-empty {
  margin: 12px 8px;
  color: var(--color-muted);
}
</style>
