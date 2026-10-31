<template>
  <div class="config-tree">
    <div v-if="!mixed" class="tree-header">
      <span class="title">{{ module?.shortName ?? 'Config' }}</span>
    </div>
    <el-tree
      :data="treeData"
      node-key="id"
      :current-node-key="selectedKey"
      highlight-current
      default-expand-all
      :expand-on-click-node="false"
      @node-click="onNodeClick"
      @node-contextmenu="onContextMenu"
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <span
            v-if="config"
            class="node-status"
            :class="`status-${data.status}`"
            :data-node-id="data.id"
            :aria-label="statusLabels[data.status as NodeStatus]"
            :title="statusLabels[data.status as NodeStatus]"
          />
          <b v-if="mixed && data.type === 'container'" class="instance-icon">i</b>
          <span v-else-if="mixed && data.type === 'definition'" class="definition-icon">⊞</span>
          <el-icon v-else class="node-icon"
            ><component :is="icons[data.type as NodeType]"
          /></el-icon>
          <span class="node-label">{{ node.label }}</span>
          <el-tag v-if="data.multiplicity && !mixed" size="small" type="info" effect="plain">{{
            formatMultiplicity(data.multiplicity)
          }}</el-tag>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Folder, FolderOpened, Document, Link } from '@element-plus/icons-vue';
import type { BswmdContainer, BswmdModule } from '@/core/bswmd/BswmdTypes';
import type { ConfigContainer, ConfigInstance } from '@/core/config/ConfigTypes';
import { indexDefinitions } from '@/core/config/ConfigTraversal';
import type { ConstraintViolation } from '@/core/constraint/ConstraintTypes';

type NodeType = 'module' | 'container' | 'definition' | 'parameter' | 'reference';
type NodeStatus = 'configured' | 'warning' | 'error';
const statusLabels = { configured: '已配置：必填齐全', warning: '有 WARNING', error: '有 ERROR' };
interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  containerUuid?: string;
  parentUuid?: string;
  definitionRef?: string;
  multiplicity?: BswmdContainer['multiplicity'];
  children?: TreeNode[];
  data?: BswmdContainer;
  status?: NodeStatus;
}
const props = defineProps<{
  module?: BswmdModule;
  config?: ConfigInstance;
  selectedKey?: string;
  violations?: ConstraintViolation[];
  mixed?: boolean;
  definitionId?: string;
  query?: string;
}>();
const emit = defineEmits<{
  'node-click': [node: TreeNode];
  'node-contextmenu': [event: MouseEvent, node: TreeNode];
}>();
const icons = {
  module: Folder,
  container: FolderOpened,
  definition: Folder,
  parameter: Document,
  reference: Link,
};

function mixedNodes(
  defs: BswmdContainer[],
  values: ConfigContainer[],
  parentUuid?: string
): TreeNode[] {
  return defs.map((definition) => ({
    id: `${parentUuid ?? 'root'}:definition:${definition.uuid}`,
    label: definition.shortName,
    type: 'definition',
    definitionRef: definition.uuid,
    parentUuid,
    children: values
      .filter((item) => item.definitionRef === definition.uuid)
      .map((item) => ({
        id: item.uuid,
        label: item.shortName,
        type: 'container',
        containerUuid: item.uuid,
        definitionRef: definition.uuid,
        children: mixedNodes(definition.subContainers, item.subContainers, item.uuid),
      })),
  }));
}
function filterNodes(nodes: TreeNode[], parent = ''): TreeNode[] {
  const query = props.query?.trim().toLowerCase();
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const path = `${parent}/${node.label}`;
    if (path.toLowerCase().includes(query)) return [node];
    const children = filterNodes(node.children ?? [], path);
    return children.length ? [{ ...node, children }] : [];
  });
}

function fields(definition: BswmdContainer, instanceUuid?: string): TreeNode[] {
  return [
    ...definition.parameters.map((parameter) => ({
      id: instanceUuid ? `${instanceUuid}:${parameter.uuid}` : parameter.uuid,
      label: parameter.shortName,
      type: 'parameter' as const,
      containerUuid: instanceUuid,
      definitionRef: parameter.uuid,
      data: definition,
    })),
    ...definition.references.map((reference) => ({
      id: instanceUuid ? `${instanceUuid}:${reference.uuid}` : reference.uuid,
      label: `${reference.shortName} → ${reference.destinationContainerType}`,
      type: 'reference' as const,
      containerUuid: instanceUuid,
      definitionRef: reference.uuid,
      data: definition,
    })),
  ];
}
function definitions(containers: BswmdContainer[]): TreeNode[] {
  return containers.map((container) => ({
    id: container.uuid,
    label: container.shortName,
    type: 'container',
    definitionRef: container.uuid,
    multiplicity: container.multiplicity,
    data: container,
    children: [...fields(container), ...definitions(container.subContainers)],
  }));
}
function instances(containers: ConfigContainer[], index: Map<string, BswmdContainer>): TreeNode[] {
  return containers.flatMap((container) => {
    const definition = index.get(container.definitionRef);
    if (!definition) return [];
    return [
      {
        id: container.uuid,
        label: container.shortName,
        type: 'container' as const,
        containerUuid: container.uuid,
        definitionRef: definition.uuid,
        data: definition,
        multiplicity: definition.multiplicity,
        children: [
          ...fields(definition, container.uuid),
          ...instances(container.subContainers, index),
        ],
      },
    ];
  });
}
function annotate(node: TreeNode): TreeNode {
  const children = node.children?.map(annotate);
  const own = (props.violations ?? []).filter((item) => {
    if (node.type === 'module') return !item.containerUuid;
    return (
      item.containerUuid === node.containerUuid &&
      (node.type === 'container' || item.definitionRef === node.definitionRef)
    );
  });
  // Only engine results determine severity; ancestors aggregate their descendants' results.
  const status: NodeStatus =
    own.some((item) => item.severity === 'ERROR') ||
    children?.some((item) => item.status === 'error')
      ? 'error'
      : own.some((item) => item.severity === 'WARNING') ||
          children?.some((item) => item.status === 'warning')
        ? 'warning'
        : 'configured';
  return { ...node, children, status };
}
const treeData = computed<TreeNode[]>(() =>
  props.mixed && props.module
    ? filterNodes(
        mixedNodes(
          props.module.containers.filter(
            (item) => !props.definitionId || item.uuid === props.definitionId
          ),
          props.config?.containers ?? []
        ).map(annotate)
      )
    : (props.module
        ? [
            {
              id: props.module.shortName,
              label: props.module.shortName,
              type: 'module' as const,
              children: props.config
                ? instances(props.config.containers, indexDefinitions(props.module))
                : definitions(props.module.containers),
            },
          ]
        : []
      ).map(annotate)
);

function formatMultiplicity(value: BswmdContainer['multiplicity']): string {
  return value.lower === value.upper
    ? String(value.lower)
    : `${value.lower}..${value.upper === 'unbounded' ? 'n' : value.upper}`;
}
function onNodeClick(node: TreeNode): void {
  emit('node-click', node);
}
function onContextMenu(event: MouseEvent, node: TreeNode): void {
  event.preventDefault();
  if (props.config) emit('node-contextmenu', event, node);
}
</script>

<style scoped>
.config-tree {
  height: 100%;
  overflow: auto;
  background: #fff;
}
.tree-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid #e4e7ed;
}
.title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.node-icon {
  color: #909399;
}
.node-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-configured {
  background: #299b54;
}
.status-warning {
  background: #d9a017;
}
.status-error {
  background: #df4545;
}
.node-label {
  font-size: 13px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instance-icon {
  color: #3b65ab;
  font-family: Georgia, serif;
  width: 14px;
  text-align: center;
}
.definition-icon {
  color: #a2763e;
  font-size: 17px;
}
:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #e5f3ff;
  border-radius: 4px;
}
:deep(.el-tree-node.is-current > .el-tree-node__content .node-label) {
  color: #318be4;
}
:deep(.el-tree-node__content) {
  height: 28px;
}
</style>
