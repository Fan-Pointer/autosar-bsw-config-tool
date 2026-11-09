# TASK-029 实现报告 — G42 引用多值（FR-21/22 核心）

- 需求来源：需求文档 v3.0 FR-21（引用值数组）/ FR-22（选择器）

## 交付

| 层 | 实现 |
|---|---|
| 类型 | `ConfigReferenceValue.targetUuids?: string[]`（多值时存在；单值保持旧字段，零迁移）；`isMultiReference()` / `referenceTargets()` helper |
| 实例 | `addReferenceTarget`（受定义 upper 约束，超界抛出「最多 N 个目标」）/ `removeReferenceTarget`（按序号删，兼容字段同步剩余首项）；`setReferenceTarget` 在多值模式下写数组 |
| ARXML 导出 | 多值逐目标展开为独立 `ECUC-REFERENCE-VALUE`（ARXML 语义） |
| ARXML 导入 | 同一引用定义的多条 `VALUE-REF` 聚合回 `targetUuids`；单目标不写数组（保持往返零 diff） |
| JSON | hydrate 校验并保留 `targetUuids`；单值数据无该字段 |
| UI | 多值引用逐目标一行（只读标签 + ×），底部「＋ 添加目标」；选择弹窗确认后走 `reference-add`；单值引用形态不变 |
| store | `addReferenceTarget` / `removeReferenceTarget` 走统一 edit 历史（可撤销）；`referenceTargetsByRef` 供表单渲染 |

## 验证

- typecheck ✓；build ✓；30 文件 **369 测试**：2 处性能断言（ecuc-ui 713ms、editor-ui）在并行负载下超时，隔离复跑各自 9/9 ✓（既定环境口径）
- 新增 `tests/reference-multi.test.ts` 3 用例：上限与删除、ARXML/JSON 多值往返、单值保持旧形态

## 未做（如实声明）

- 引用选择弹窗的**树形 valuePath + 分页 10**（FR-22 视觉部分）未实现：现有为搜索 + 列表 + 暂存确认
- 多值目标的 dangling 检测仍按首目标（兼容字段）判定，逐目标悬空提示待补
