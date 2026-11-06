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
    <div class="menu-caption">{{ title }}</div>
    <template v-if="childrenOpen">
      <button role="menuitem" tabindex="-1" class="menu-back" @click="back">‹ 返回容器操作</button>
      <p v-if="!actions.childOptions.length" class="menu-empty">此容器没有子定义</p>
      <button
        v-for="option in actions.childOptions"
        :key="option.definition.uuid"
        role="menuitem"
        tabindex="-1"
        :data-definition-id="option.definition.uuid"
        :disabled="Boolean(actions.editReason || option.disabledReason)"
        :aria-disabled="Boolean(actions.editReason || option.disabledReason)"
        @click="add(option.definition.uuid)"
      >
        <span class="menu-label"
          ><span class="menu-icon">⊞</span>{{ option.definition.shortName }}</span
        >
        <small v-if="actions.editReason || option.disabledReason">{{
          actions.editReason || option.disabledReason
        }}</small>
      </button>
    </template>
    <template v-else>
      <button
        role="menuitem"
        tabindex="-1"
        aria-haspopup="menu"
        :aria-disabled="Boolean(targetReason)"
        :disabled="Boolean(targetReason)"
        @click="openChildren"
      >
        <span class="menu-label"
          ><span class="menu-icon">＋</span>新建<span class="menu-arrow">›</span></span
        >
        <small v-if="targetReason">{{ targetReason }}</small>
      </button>
      <button
        role="menuitem"
        tabindex="-1"
        :disabled="Boolean(cloneReason)"
        :aria-disabled="Boolean(cloneReason)"
        @click="clone"
      >
        <span class="menu-label"><span class="menu-icon">⧉</span>克隆实例</span
        ><small v-if="cloneReason">{{ cloneReason }}</small>
      </button>
      <button
        role="menuitem"
        tabindex="-1"
        :disabled="Boolean(removalReason)"
        :aria-disabled="Boolean(removalReason)"
        @click="remove"
      >
        <span class="menu-label"><span class="menu-icon">×</span>删除实例</span
        ><small v-if="removalReason">{{ removalReason }}</small>
      </button>
      <button
        role="menuitem"
        tabindex="-1"
        :disabled="!firstError"
        :aria-disabled="!firstError"
        @click="locate"
      >
        <span class="menu-label"><span class="menu-icon">⌖</span>定位错误</span
        ><small v-if="!firstError">{{ definitionReason || '此实例没有错误' }}</small>
      </button>
      <button role="menuitem" tabindex="-1" class="menu-back" @click="close(true)">
        关闭菜单 <span class="menu-arrow">Esc</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';
import { useConfigStore } from '@/stores/configStore';
import { placeContainerMenu, type ContainerContextTarget } from './containerMenuPosition';

const props = defineProps<{
  target: ContainerContextTarget;
  x: number;
  y: number;
  returnFocus?: HTMLElement;
}>();
const emit = defineEmits<{ close: []; navigate: [violation: ConstraintViolation] }>();
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
  props.target.type === 'definition'
    ? '这是容器定义；请使用树工具栏＋创建实例，或右键实例进行操作'
    : undefined
);
const targetReason = computed(() => definitionReason.value || actions.value.editReason);
const cloneReason = computed(() => targetReason.value || actions.value.cloneReason);
const removalReason = computed(() => targetReason.value || actions.value.removalReason);
const title = computed(() => actions.value.entry?.container.shortName || '容器定义');
const firstError = computed(() =>
  props.target.type === 'instance'
    ? store.violations.find(
        (item) => item.severity === 'ERROR' && item.containerUuid === props.target.containerUuid
      )
    : undefined
);

function close(restoreFocus = false): void {
  const target = props.returnFocus;
  emit('close');
  if (restoreFocus) void nextTick(() => target?.isConnected && target.focus());
}
function focusItem(last = false): void {
  const items = panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
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
  const items = [
    ...(panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
  ];
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
    items[index]?.click();
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
function locate(): void {
  const violation = firstError.value;
  close();
  if (violation) emit('navigate', violation);
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
  width: 296px;
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
.menu-caption {
  padding: 5px 8px;
  color: var(--color-muted);
  overflow-wrap: anywhere;
  font-size: 12px;
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
}
button:hover:not(:disabled),
button:focus-visible {
  background: var(--color-selected);
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
}
button:disabled {
  color: var(--color-muted);
  cursor: not-allowed;
}
.menu-label {
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow-wrap: anywhere;
}
.menu-icon {
  flex-shrink: 0;
  width: 16px;
}
.menu-arrow {
  margin-left: auto;
  float: right;
}
small {
  display: block;
  margin: 3px 0 0 22px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  font-size: 11px;
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
