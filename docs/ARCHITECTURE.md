# AUTOSAR BSW Config Tool - 架构设计文档

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (Chrome 90+)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  ConfigTree  │  │  DetailForm  │  │ HelpPanel    │  │  Toolbar    │ │
│  │  (左侧导航)   │  │  (中间表单)   │  │ (右侧帮助)   │  │ (顶部工具)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                        Vue 3 + TypeScript (Composition API)             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Store Layer (Pinia)                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │ configStore  │  │validationStore│  │      uiStore         │  │   │
│  │  │ (配置数据)    │  │  (验证状态)   │  │    (UI状态)          │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Model Layer                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │   DemDTC     │  │ DemAttributes│  │ DemEventParameter    │  │   │
│  │  │ DemDebounce  │  │ DemFreezeFrame│  │ DemOperationCycle   │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Service Layer                            │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │arxmlSerializer│  │ arxmlParser  │  │ validatorEngine      │  │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────────┐                           │   │
│  │  │referenceGraph│  │templateEngine│                           │   │
│  │  └──────────────┘  └──────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Storage Layer                            │   │
│  │              IndexedDB (via LocalForage)                        │   │
│  │                 LocalStorage (UI状态)                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流设计

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   UI Form   │────→│ configStore │────→│ IndexedDB   │
│  (用户输入)  │     │ (内存状态)  │     │ (持久化)    │
└─────────────┘     └─────────────┘     └─────────────┘
        ↑                    ↓
        │             ┌─────────────┐
        └─────────────│ validation  │
                      │   Engine    │
                      └─────────────┘
```

---

## 3. 核心模块划分

### 3.1 BSW 模块边界（按 AUTOSAR 规范）

```
autosar-bsw-config-tool/
├── src/
│   ├── modules/
│   │   ├── dem/                    # Diagnostic Event Manager
│   │   │   ├── models/             # DTC, Attributes, Event, Debounce...
│   │   │   ├── components/         # DTC Form, Debounce Config...
│   │   │   ├── stores/             # Dem-specific stores
│   │   │   └── utils/              # Dem validators, transformers
│   │   ├── dcm/                    # Diagnostic Communication Manager (Phase X)
│   │   ├── nvm/                    # NVRAM Manager (Phase X)
│   │   └── ...                     # 其他 BSW 模块
│   ├── shared/                     # 跨模块共享代码
│   └── App.vue
```

### 3.2 模块接口契约

每个 BSW 模块必须实现：

```typescript
// modules/dem/index.ts
export interface DemModule {
  // 模块元数据
  readonly moduleName: 'Dem';
  readonly shortName: string;
  readonly description: string;
  readonly version: string;
  
  // 配置模型
  models: {
    DemConfigSet: typeof DemConfigSet;
    DemDTC: typeof DemDTC;
    // ...
  };
  
  // ARXML 转换器
  serializers: {
    toArxml: (config: DemConfigSet) => string;
    fromArxml: (xml: string) => DemConfigSet;
  };
  
  // 验证器
  validators: {
    validateConfig: (config: DemConfigSet) => ValidationResult[];
    validateReference: (config: DemConfigSet) => ReferenceError[];
  };
  
  // UI 组件注册
  components: {
    ConfigTree: Component;
    DetailForm: Component;
  };
}
```

---

## 4. ARXML 双模型架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARXML 双模型架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│   │   UI Form   │ ←──→ │  JSON Model │ ←──→ │ ARXML Model │   │
│   │  (扁平结构)  │      │ (中间表示)  │      │ (规范结构)  │   │
│   └─────────────┘      └─────────────┘      └─────────────┘   │
│           ↑                    ↓                     ↓          │
│           │              ┌─────────┐           ┌─────────┐   │
│           └──────────────│ Transformer │←────→│ XML Parser│   │
│                          └─────────┘           └─────────┘   │
│                                                                 │
│   - JSON Model: 面向 UI，支持快速表单绑定                        │
│   - ARXML Model: 面向规范，保留完整 AUTOSAR 结构                 │
│   - Transformer: 双向转换，处理 UUID、命名空间、引用关系         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 条件字段联动设计

```typescript
// 联动配置表驱动
interface FieldDependency {
  parent: string;           // 父字段名
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt';
  value: any;             // 触发值
  children: string[];     // 受控子字段
  behavior: 'disable' | 'hide' | 'required' | 'optional';
}

// 示例：DemAgingAllowed 控制子字段
const AGING_DEPENDENCY: FieldDependency = {
  parent: 'DemAgingAllowed',
  operator: 'eq',
  value: true,
  children: [
    'DemAgingCycleCounterThreshold',
    'DemAgingCycleCounterThresholdForTFSLC',
    'DemAgingCycleRef'
  ],
  behavior: 'disable'  // parent=false 时禁用
};
```

---

## 6. 性能优化策略

| 场景 | 策略 | 实现 |
|------|------|------|
| 1000+ DTC 列表 | 虚拟滚动 | vue-virtual-scroller |
| 大型 ARXML 解析 | 分块处理 + Web Worker | 异步解析 |
| 表单频繁更新 | Debounce + Patch | Lodash debounce |
| 历史记录 | 结构化克隆 + 大小限制 | 最多 20 步 |
| 主题切换 | CSS Variables | 预编译主题变量 |

---

## 7. 演进路线图

```
Phase 1: 骨架与数据模型 (1-2周)
├── Vue 3 + Vite 项目初始化
├── Dem 模块数据模型定义
├── 基础 Store 架构
└── 空壳界面

Phase 2: 核心配置模块 (3-4周)
├── DemConfigSet 管理
├── DemDTC 配置表单
├── DemDTCAttributes 配置
├── DemEventParameter 配置
├── Debounce 算法配置
└── 配置验证引擎

Phase 3: ARXML 规范支持 (2-3周)
├── ARXML 导入解析
├── ARXML 导出生成
├── UUID 管理
└── 引用关系图 (Vue Flow)

Phase 4: UI/UX 完善 (2周)
├── 三栏布局响应式优化
├── 暗色/亮色主题
├── 配置向导
├── 撤销/重做
└── 批量操作

Phase 5: 测试与验收 (1-2周)
├── 单元测试覆盖
├── E2E 测试
├── DaVinci 兼容性验证
└── 性能测试

Phase X+: BSW 扩展
├── NvM 模块
├── DCM 模块
├── Can 模块
└── ...
```

---

## 附录：ADR 索引

| ADR | 标题 | 状态 |
|-----|------|------|
| ADR-001 | 纯前端架构 | 已接受 |
| ADR-002 | 模块化单体 | 已接受 |
| ADR-003 | 数据模型层分离 | 已接受 |
| ADR-004 | DEM-first 演进策略 | 已接受 |

---

**版本**: 1.0.0  
**日期**: 2026-10-31  
**维护者**: 锻码师
