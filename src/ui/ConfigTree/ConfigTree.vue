<template>
  <div class="config-tree">
    <div class="tree-header">
      <span class="title">{{ moduleName }}</span>
      <el-button link size="small" @click="addContainer">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>

    <el-tree
      :data="treeData"
      :props="treeProps"
      :highlight-current="true"
      :default-expand-all="false"
      :expand-on-click-node="false"
      @node-click="onNodeClick"
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <el-icon class="node-icon">
            <component :is="getNodeIcon(data.type)" />
          </el-icon>
          <span class="node-label">{{ node.label }}</span>
          <el-tag v-if="data.multiplicity" size="small" type="info" effect="plain">
            {{ formatMultiplicity(data.multiplicity) }}
          </el-tag>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { BswmdContainer } from '@/core/bswmd/BswmdTypes';

interface TreeNode {
  id: string;
  label: string;
  type: 'module' | 'container' | 'parameter' | 'reference';
  multiplicity?: { lower: number; upper: number | 'unbounded' };
  children?: TreeNode[];
  data?: BswmdContainer;
}

interface Props {
  /** BSWMD 模块定义 */
  module?: import('@/core/bswmd/BswmdTypes').BswmdModule;
}

const props = withDefaults(defineProps<Props>(), {
  module: undefined
});

const emit = defineEmits<{
  'node-click': [node: TreeNode];
  'add-container': [parentUuid: string];
}>();

const moduleName = computed(() => props.module?.shortName ?? 'Config');

const treeData = computed<TreeNode[]>(() => {
  if (!props.module) return [];

  const nodes: TreeNode[] = [{
    id: props.module.shortName,
    label: props.module.shortName,
    type: 'module',
    children: buildContainerNodes(props.module.containers)
  }];

  return nodes;
});

const treeProps = {
  label: 'label',
  children: 'children'
};

/**
 * 递归构建容器节点
 */
function buildContainerNodes(containers: BswmdContainer[]): TreeNode[] {
  return containers.map(container => ({
    id: container.uuid,
    label: container.shortName,
    type: 'container',
    multiplicity: container.multiplicity,
    data: container,
    children: [
      // 参数节点
      ...container.parameters.map(param => ({
        id: param.uuid,
        label: param.shortName,
        type: 'parameter' as const
      })),
      // 引用节点
      ...container.references.map(ref => ({
        id: ref.uuid,
        label: `${ref.shortName} → ${ref.destinationContainerType}`,
        type: 'reference' as const
      })),
      // 子容器节点
      ...(container.subContainers.length > 0 ? [{
        id: `${container.uuid}_children`,
        label: 'Sub-containers',
        type: 'container' as const,
        children: buildContainerNodes(container.subContainers)
      }] : [])
    ]
  }));
}

/**
 * 获取节点图标
 */
function getNodeIcon(type: string) {
  const icons: Record<string, string> = {
    module: 'Folder',
    container: 'FolderOpened',
    parameter: 'Document',
    reference: 'Link'
  };
  return icons[type] || 'Document';
}

/**
 * 格式化多重性显示
 */
function formatMultiplicity(mult: { lower: number; upper: number | 'unbounded' }): string {
  const lower = mult.lower;
  const upper = mult.upper === 'unbounded' ? 'n' : String(mult.upper);

  if (lower === 0 && upper === '1') return '0..1';
  if (lower === 1 && upper === '1') return '1';
  if (lower === 0 && upper === 'n') return '0..n';
  if (lower === 1 && upper === 'n') return '1..n';
  return `${lower}..${upper}`;
}

/**
 * 节点点击处理
 */
function onNodeClick(node: TreeNode): void {
  emit('node-click', node);
}

/**
 * 添加容器
 */
function addContainer(): void {
  // TODO: 实现添加容器逻辑
  emit('add-container', '');
}
</script>

<style scoped>
.config-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.tree-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  flex: 1;
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
