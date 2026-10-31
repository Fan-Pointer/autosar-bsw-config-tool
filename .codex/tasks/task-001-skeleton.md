# Task-001: 项目骨架与数据模型

## 任务元信息
- **优先级**: P0
- **预估工时**: 1-2 天
- **依赖任务**: 无

## 背景
- **所属阶段**: Phase 1 - 项目骨架与数据模型
- **参考文档**:
  - docs/internal-data-model.md (完整数据模型定义)
  - docs/REQUIREMENTS.md 第 6 章
- **前置任务**: 无

## 目标
搭建可运行的空壳项目，完成 DEM 模块核心数据模型定义和基础 Pinia store。

## 当前状态
- 项目骨架已存在 (Vue 3 + Vite + TS)
- 需要实现数据模型和 Store

## 必须交付的文件

### 1. 基础类型定义
**文件**: `src/types/base.ts`
```typescript
// 必须包含:
export type UUID = string;
export type EcucRef = string;
export type ShortName = string;

export enum ConfigClass {
  PRE_COMPILE = 'VARIANT-PRE-COMPILE',
  LINK_TIME = 'VARIANT-LINK-TIME',
  POST_BUILD = 'VARIANT-POST-BUILD'
}

export interface Multiplicity {
  lower: number;
  upper: number | 'unbounded';
}

export interface EcucElement {
  uuid: UUID;
  shortName: ShortName;
  description?: string;
}
```

### 2. DEM 数据模型
在 `src/modules/dem/models/` 目录下创建：

**2.1 DemDTC.ts**
```typescript
// 必须实现:
// - DemDTCSeverity 枚举 (NO_SEVERITY, CHECK_IMMEDIATELY, CHECK_AT_NEXT_HALT, MAINTENANCE_ONLY)
// - DemWWHOBDDTCClass 枚举 (NOCLASS, CLASS_A, CLASS_B1, CLASS_B2, CLASS_C)
// - DemDTC 接口 (demDtcValue, demDTCSeverity, demWWHOBDDTCClass, demDTCAttributesRef)
// - createDemDTC 工厂函数
// - DemDTCValidationRules 验证规则 (demDtcValue: 0x000001-0xFFFFFF, reserved: [0x000000])
```

**2.2 DemDTCAttributes.ts**
```typescript
// 必须实现:
// - DemEventSignificance 枚举 (FAULT, OCCURRENCE)
// - DemMemoryDestination 枚举 (PRIMARY, MIRROR, USER_DEFINED)
// - DemDTCAttributes 接口 (demAgingAllowed, demAgingCycleCounterThreshold, demDTCPriority, etc.)
// - DemDTCAttributesDependencies 联动配置
// - createDemDTCAttributes 工厂函数
```

**2.3 DemEventParameter.ts**
```typescript
// 必须实现:
// - DemEventKind 枚举 (BSW, SWC)
// - DemDebounceType 枚举 (NONE, COUNTER_BASED, TIME_BASED, MONITOR_INTERNAL)
// - DemEventParameter 接口
// - generateEventId 函数 (1-65535)
// - createDemEventParameter 工厂函数
```

**2.4 DemDebounceCounterBasedClass.ts**
```typescript
// 必须实现:
// - DemDebounceBehavior 枚举 (FREEZE, RESET)
// - DemDebounceCounterBasedClass 接口
// - DemDebounceCounterValidationRules 验证规则
// - createDemDebounceCounterBasedClass 工厂函数
```

**2.5 DemDebounceTimeBasedClass.ts**
```typescript
// 必须实现:
// - DemDebounceTimeBasedClass 接口
// - DemDebounceTimeValidationRules 验证规则
// - createDemDebounceTimeBasedClass 工厂函数
```

**2.6 DemOperationCycle.ts**
```typescript
// 必须实现:
// - DemOperationCycleType 枚举 (IGNITION, OBD_DCY, WARMUP, POWER)
// - DemOperationCycle 接口
// - createDemOperationCycle 工厂函数
```

**2.7 DemConfigSet.ts**
```typescript
// 必须实现:
// - DemConfigSet 接口 (包含所有子元素数组)
// - createDemConfigSet 工厂函数
```

**2.8 index.ts**
```typescript
// 统一导出所有 DEM 模型
```

### 3. 根配置模型
**文件**: `src/models/AutosarConfig.ts`
```typescript
// 必须实现:
// - AutosarConfig 接口 (metadata, dem 等)
// - createAutosarConfig 工厂函数
```

### 4. UUID 工具
**文件**: `src/utils/uuid.ts`
```typescript
// 使用 uuid npm 包
import { v4 as uuidv4 } from 'uuid';
export function generateUUID(): string {
  return uuidv4();
}
export function generateEcucUUID(): string {
  return `ECUC:${uuidv4()}`;
}
```

### 5. Pinia Store
**文件**: `src/stores/configStore.ts`
```typescript
// 必须实现:
// - useConfigStore 定义
// - State: config, currentConfigSetId, isDirty, isLoading, error
// - Getters: hasConfig, currentConfigSet
// - Actions: initStorage, loadConfig, saveConfig, markDirty
// - 使用 LocalForage 持久化到 IndexedDB
// - Storage key: 'autosar-config-v1'
```

## 约束
- **禁止**: 使用后端 API
- **必须**: 所有类型显式定义，禁止 `any`
- **必须**: 使用 Vue 3 Composition API
- **必须**: LocalForage 用于本地存储
- **版本**: uuid@11.x (注意: uuid v11 API 可能有变化，按需调整)

## 验收标准
- [ ] 所有 .ts 文件通过 TypeScript 编译 (npm run build)
- [ ] 无 ESLint errors
- [ ] src/types/base.ts 存在且正确
- [ ] src/modules/dem/models/ 包含 8 个文件
- [ ] configStore 支持 load/save/markDirty
- [ ] 刷新页面后数据可恢复

## 验收流程
1. 实现上述文件
2. 运行 `npm install` 安装依赖
3. 运行 `npm run build` 验证编译
4. 提交到 feature/task-001-skeleton 分支
5. 创建 PR
