<template>
  <div class="config-tree">
    <div class="tree-header">
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
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <el-icon class="node-icon"><component :is="icons[data.type as NodeType]" /></el-icon>
          <span class="node-label">{{ node.label }}</span>
          <el-tag v-if="data.multiplicity" size="small" type="info" effect="plain">{{
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

type NodeType = 'module' | 'container' | 'parameter' | 'reference';
interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  containerUuid?: string;
  definitionRef?: string;
  multiplicity?: BswmdContainer['multiplicity'];
  children?: TreeNode[];
  data?: BswmdContainer;
}
const props = defineProps<{
  module?: BswmdModule;
  config?: ConfigInstance;
  selectedKey?: string;
}>();
const emit = defineEmits<{ 'node-click': [node: TreeNode] }>();
const icons = { module: Folder, container: FolderOpened, parameter: Document, reference: Link };

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
const treeData = computed<TreeNode[]>(() =>
  props.module
    ? [
        {
          id: props.module.shortName,
          label: props.module.shortName,
          type: 'module',
          children: props.config
            ? instances(props.config.containers, indexDefinitions(props.module))
            : definitions(props.module.containers),
        },
      ]
    : []
);

function formatMultiplicity(value: BswmdContainer['multiplicity']): string {
  return value.lower === value.upper
    ? String(value.lower)
    : `${value.lower}..${value.upper === 'unbounded' ? 'n' : value.upper}`;
}
function onNodeClick(node: TreeNode): void {
  emit('node-click', node);
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
}
.node-icon {
  color: #909399;
}
.node-label {
  font-size: 13px;
  color: #606266;
}
:deep(.el-tree-node__content) {
  height: 32px;
}
</style>
