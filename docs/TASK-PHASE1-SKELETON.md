# Task-001: 项目骨架与数据模型

## 任务元信息
- **优先级**: P0
- **预估工时**: 1-2 天
- **依赖任务**: 无
- **验收人**: 王上 + 锻码师

---

## 背景

- **所属阶段**: Phase 1 - 项目骨架与数据模型
- **参考文档**:
  - docs/REQUIREMENTS.md 第 6 章
  - docs/internal-data-model.md 完整章节
  - project-engineering-file.md 第 2、3 节
- **前置任务**: 无

## 目标

搭建可运行的空壳项目，完成 DEM 模块核心数据模型定义和基础 Pinia store。

## 输入

- **代码基线**: `D:/ProFile/教培业务/配置器/autosar-bsw-config-tool/` 已初始化完成
- **数据模型**: docs/internal-data-model.md 第 2 节
- **Store 框架**: Pinia，路径 `src/stores/configStore.ts` 已创建空文件

## 输出

### 必须交付的文件

| 文件路径 | 说明 |
|----------|------|
| `src/types/base.ts` | 基础类型定义 (UUID, EcucRef, ShortName...) |
| `src/models/AutosarConfig.ts` | 配置根对象 |
| `src/modules/dem/models/DemConfigSet.ts` | 配置集模型 |
| `src/modules/dem/models/DemDTC.ts` | DTC 模型 |
| `src/modules/dem/models/DemDTCAttributes.ts` | DTC 属性模型 |
| `src/modules/dem/models/DemEventParameter.ts` | 事件参数模型 |
| `src/modules/dem/models/DemDebounceCounterBasedClass.ts` | 计数器去抖模型 |
| `src/modules/dem/models/DemDebounceTimeBasedClass.ts` | 时间去抖模型 |
| `src/modules/dem/models/DemOperationCycle.ts` | 操作周期模型 |
| `src/modules/dem/models/index.ts` | 统一导出 |
| `src/stores/configStore.ts` | 实现完整的配置管理 Store |
| `src/components/common/FormField.vue` | 智能表单字段组件 |

### 可选文件
- 单元测试: `tests/unit/models/Dem*.test.ts`
- 工具函数: `src/utils/uuid.ts`, `src/utils/validators.ts`

### 验收标准 (Checklist)

- [ ] 所有 `.ts` 文件通过 TypeScript 严格模式编译（无 error）
- [ ] `npm run dev` 可运行，显示 HomeView
- [ ] `src/types/base.ts` 包含：UUID, EcucRef, ShortName, ConfigClass, Multiplicity, EcucElement
- [ ] `DemDTC` 包含：demDtcValue, demDTCSeverity, demWWHOBDDTCClass, demDTCAttributesRef
- [ ] `DemDTCAttributes` 包含：demAgingAllowed, demDTCPriority, 老化配置组字段
- [ ] `DemEventParameter` 包含：demEventId, demEventKind, demDebounceAlgorithm
- [ ] `configStore` 支持：loadConfig/saveConfig/markDirty/createConfigSet
- [ ] 本地存储使用 LocalForage，键名为 `autosar-config-v1`
- [ ] 刷新页面后数据可恢复
- [ ] 代码符合 ESLint 配置（无 error，warning 可接受）

## 约束

### 必须遵守
- **禁止**: 使用任何后端 API，发送数据到远程服务器
- **必须**: 所有类型使用 TypeScript interface/type 显式定义，禁止 `any`（必须显式写 any 的情况需加注释说明）
- **必须**: Vue 3 Composition API + `<script setup lang="ts">`
- **必须**: 组件命名使用 PascalCase，文件命名使用 kebab-case
- **性能**: 1000+ DTC 配置不卡顿（后续优化，但数据结构设计需考虑）

### 技术约束
- Vue 3.5+, TypeScript 5.7+
- Pinia 2.2+
- Element Plus 2.8+
- LocalForage 1.10+
- UUID 9.x

## 参考代码

### 期望的数据模型风格

```typescript
// src/modules/dem/models/DemDTC.ts
import { EcucElement, UUID } from '@/types/base';

export enum DemDTCSeverity {
  NO_SEVERITY = 'DEM_SEVERITY_NO_SEVERITY',
  CHECK_IMMEDIATELY = 'DEM_SEVERITY_CHECK_IMMEDIATELY',
  CHECK_AT_NEXT_HALT = 'DEM_SEVERITY_CHECK_AT_NEXT_HALT',
  MAINTENANCE_ONLY = 'DEM_SEVERITY_MAINTENANCE_ONLY'
}

export interface DemDTC extends EcucElement {
  demDtcValue: number;
  demDTCFunctionalUnit?: number;
  demDTCSeverity: DemDTCSeverity;
  demWWHOBDDTCClass?: DemWWHOBDDTCClass;
  demDTCAttributesRef: UUID;
  demObdDTCRef?: UUID;
}

export const DemDTCValidationRules = {
  demDtcValue: {
    min: 0x000001,
    max: 0xFFFFFF,
    reserved: [0x000000]
  }
};

export function createDemDTC(shortName: string): DemDTC {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDtcValue: 0x000001,
    demDTCSeverity: DemDTCSeverity.NO_SEVERITY,
    demDTCAttributesRef: ''  // 必填，创建后必须关联
  };
}
```

### 期望的 Store 风格

```typescript
// src/stores/configStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useConfigStore = defineStore('config', () => {
  const config = ref<AutosarConfig | null>(null);
  const currentConfigSetId = ref<string | null>(null);
  const isDirty = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const hasConfig = computed(() => config.value !== null);

  const loadConfig = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await localforage.getItem<AutosarConfig>(STORAGE_KEY);
      if (data) {
        config.value = data;
      }
    } catch (err) {
      error.value = 'Failed to load config';
    } finally {
      isLoading.value = false;
    }
  };

  const saveConfig = async () => {
    if (!config.value) return;
    // ...
  };

  return {
    config,
    currentConfigSetId,
    isDirty,
    isLoading,
    error,
    hasConfig,
    loadConfig,
    saveConfig
  };
});
```

## 验收流程

1. Codex 提交 PR 到 `feature/phase1-skeleton` 分支
2. 锻码师 review 代码
3. 按检查单逐项过，输出评审结果
4. 🔴 阻塞问题必须修复
5. 修复后重新 review
6. 通过后合并到 main，王上确认

## 问题反馈

如遇到以下情况，停止开发并反馈：
1. 数据模型定义与 AUTOSAR 规范冲突
2. 无法纯前端实现的需求
3. 技术选型与架构设计冲突

反馈格式：
```
**问题**: {描述}
**位置**: {文件/代码行}
**建议**: {你的建议}
**阻塞**: 是/否
```

---

## 附录：TypeScript 严格模式要求

- `strict: true`（已在 tsconfig.json 开启）
- `noImplicitAny: true`
- `strictNullChecks: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- 禁止 `any`（除非显式注释说明原因）
