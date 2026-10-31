# Codex 任务下发模板

## 使用说明

王上使用此模板向 Codex 下发开发任务。每次下发需包含以下信息：

---

## 任务头信息

```markdown
# Task-{编号}: {任务标题}

## 任务元信息
- **优先级**: P0 / P1 / P2
- **预估工时**: X 天
- **依赖任务**: Task-{编号} (如有)
- **验收人**: 王上 + 锻码师
```

---

## 背景与目标

```markdown
## 背景
- 所属阶段: Phase {1-5}
- 参考文档: 
  - project-engineering-file.md 第 X 节
  - docs/REQUIREMENTS.md FR-{XXX}
  - docs/ARCHITECTURE.md 第 X 节
- 前置任务: Task-{XXX} 已完成

## 目标
用 1-3 句话描述本任务要达到的具体结果。
```

---

## 输入材料

```markdown
## 输入
- **代码基线**: `src/` 目录当前状态 (commit: xxx)
- **数据模型**: docs/internal-data-model.md 第 X 节
- **接口约定**: project-engineering-file.md 第 5 节
```

---

## 输出要求

```markdown
## 输出
### 必须交付的文件
1. `src/path/to/file1.ts` - 功能说明
2. `src/path/to/file2.vue` - 功能说明
3. ...

### 可选/建议的文件
- 单元测试: `tests/...`
- 文档更新: `docs/...`

### 验收标准 (Checklist)
- [ ] 功能点 1 已实现
- [ ] 功能点 2 已验证
- [ ] 通过以下测试用例: TC-XXX
- [ ] 无 TypeScript 编译错误
- [ ] 代码符合项目 ESLint 配置
```

---

## 约束与红线

```markdown
## 约束
- **禁止**: 使用后端 API、发送数据到远程服务器
- **必须**: 纯 TypeScript 实现，类型安全
- **性能**: 1000+ 数据量不卡顿 (如有列表)
- **兼容**: Chrome 90+, Firefox 88+, Edge 90+

## 技术约束细节
- Vue 3 Composition API + TypeScript 严格模式
- 状态管理使用 Pinia
- UI 组件使用 Element Plus
- ARXML 处理使用 fast-xml-parser
```

---

## 参考示例

```markdown
## 参考代码
### 期望的 API 风格
```typescript
// 示例代码
```

### 类似实现参考
- 项目内: `src/modules/dem/components/DtcForm.vue`
- 外部: Element Plus 官方文档 xxx
```

---

## 问题反馈

```markdown
## 问题反馈
如遇到以下情况，停止开发并反馈：
1. 需求不明确或自相矛盾
2. 技术实现与现有架构冲突
3. 发现无法纯前端实现的需求

反馈格式:
```
**问题**: {描述}
**位置**: {文件/代码行}
**建议**: {你的建议}
**阻塞**: 是/否 (阻塞=无法继续开发)
```
```

---

## 完整示例

见下方 `Task-Sample.md`

---

# Task-Sample: DemConfigSet 基础管理

## 任务元信息
- **优先级**: P0
- **预估工时**: 1-2 天
- **依赖任务**: 无 (Phase 1 骨架已完成)
- **验收人**: 王上 + 锻码师

## 背景
- 所属阶段: Phase 2 核心配置模块
- 参考文档: 
  - docs/REQUIREMENTS.md FR-Core-001
  - docs/internal-data-model.md 第 2.1 节
- 前置任务: Task-Init (Vue 项目骨架) 已完成

## 目标
实现 DemConfigSet 的增删改查基础功能，包括创建、克隆、删除配置集，数据持久化到 IndexedDB。

## 输入
- **代码基线**: `src/` 目录，已有空壳组件
- **数据模型**: docs/internal-data-model.md DemConfigSet 定义
- **Store 框架**: Pinia，路径 `src/stores/configStore.ts` 已创建空文件

## 输出
### 必须交付的文件
1. `src/stores/configStore.ts` - Pinia store，管理 AutosarConfig 状态
2. `src/modules/dem/stores/demStore.ts` - DEM 模块专用 store
3. `src/modules/dem/components/ConfigSetManager.vue` - 配置集管理界面
4. `src/modules/dem/utils/persistence.ts` - IndexedDB 持久化工具

### 验收标准 (Checklist)
- [ ] 可创建新 DemConfigSet，输入名称后自动生成 UUID
- [ ] 可克隆配置集，深拷贝所有子配置
- [ ] 可删除配置集，有确认对话框
- [ ] 数据自动保存到 IndexedDB (via LocalForage)
- [ ] 刷新页面后数据可恢复
- [ ] 使用 Composition API + TypeScript 严格模式

## 约束
- **禁止**: 使用任何后端 API
- **必须**: 所有配置数据持久化到浏览器本地
- **性能**: 配置集列表支持 50+ 项不卡顿

## 参考代码
### Store 期望结构
```typescript
// src/stores/configStore.ts
import { defineStore } from 'pinia';
import { AutosarConfig } from '@/models/AutosarConfig';

export const useConfigStore = defineStore('config', () => {
  // State
  const config = ref<AutosarConfig | null>(null);
  const currentConfigSetId = ref<string | null>(null);
  
  // Actions
  const createConfigSet = (name: string) => { ... };
  const deleteConfigSet = (id: string) => { ... };
  const cloneConfigSet = (id: string, newName: string) => { ... };
  
  // Persistence
  const saveToStorage = async () => { ... };
  const loadFromStorage = async () => { ... };
  
  return { config, currentConfigSetId, createConfigSet, deleteConfigSet, cloneConfigSet };
});
```

### UI 期望风格
使用 Element Plus 组件：
- `el-table` 展示配置集列表
- `el-dialog` 用于创建/编辑弹窗
- `el-button` 操作按钮
- `el-message-box` 确认删除

## 问题反馈
如需求有疑问，按上述格式反馈。
