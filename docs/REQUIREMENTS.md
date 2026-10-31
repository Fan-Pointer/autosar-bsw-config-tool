# AUTOSAR BSW Config Tool - 需求文档

## 1. 项目背景与目标

### 1.1 背景
AUTOSAR BSW 配置工具是汽车电子开发的核心工具，现有商业工具（如 ETAS、Vector DaVinci、普华、恒润）价格昂贵且授权复杂。本项目旨在开发一个基于网页的开源替代方案，首期聚焦 DEM（Diagnostic Event Manager）DTC 配置模块。

### 1.2 目标
- 提供 DEM DTC 配置的可视化界面
- 支持 ARXML 格式导入导出，兼容 AUTOSAR 4.2.2 规范
- 纯前端实现，无需后端服务器
- 支持离线使用

---

## 2. 功能需求

### 2.1 核心配置模块 (FR-Core)

#### FR-Core-001: DemConfigSet 管理
**优先级**: P0  
**描述**: 支持创建和管理多个配置集

| 需求项 | 详细描述 | 验收标准 |
|--------|----------|----------|
| 创建 | 新建 DemConfigSet，输入名称和描述 | 自动生成唯一 ID |
| 克隆 | 深拷贝现有配置集 | 保留所有配置项及引用关系 |
| 删除 | 删除配置集，需二次确认 | 有引用时警告 |
| 导入/导出 | JSON 格式 | 导出可完整重新导入 |
| 版本管理 | 显示修改时间 | 本地时间戳 |

#### FR-Core-002: DemDTC 配置
**优先级**: P0  
**描述**: 完整的 DTC 配置功能

**基础属性**:
| 字段 | 类型 | 约束 | UI 控件 |
|------|------|------|---------|
| DemDtcValue | 十六进制 | 0x000001-0xFFFFFF | HexInput |
| DemDTCFunctionalUnit | 数字 | 0-255, 可选 | NumberInput |
| DemDTCSeverity | 枚举 | 见下表 | Select |
| DemWWHOBDDTCClass | 枚举 | 见下表 | Select |

**枚举值定义**:
```typescript
enum DemDTCSeverity {
  DEM_SEVERITY_NO_SEVERITY = 'NO_SEVERITY',
  DEM_SEVERITY_CHECK_IMMEDIATELY = 'CHECK_IMMEDIATELY',
  DEM_SEVERITY_CHECK_AT_NEXT_HALT = 'CHECK_AT_NEXT_HALT',
  DEM_SEVERITY_MAINTENANCE_ONLY = 'MAINTENANCE_ONLY'
}

enum DemWWHOBDDTCClass {
  DEM_DTC_WWHOBD_CLASS_NOCLASS = 'NOCLASS',
  DEM_DTC_WWHOBD_CLASS_A = 'CLASS_A',
  DEM_DTC_WWHOBD_CLASS_B1 = 'CLASS_B1',
  DEM_DTC_WWHOBD_CLASS_B2 = 'CLASS_B2',
  DEM_DTC_WWHOBD_CLASS_C = 'CLASS_C'
}
```

**引用关系**:
- DemDTCAttributesRef: 必选 → DemDTCAttributes
- DemObdDTCRef: 可选 → DemObdDTC

#### FR-Core-003: DemDTCAttributes 配置
**优先级**: P0

**字段清单**:
| 分组 | 字段名 | 类型 | Multiplicity | 条件依赖 |
|------|--------|------|--------------|----------|
| 老化配置 | DemAgingAllowed | boolean | 1 | - |
| | DemAgingCycleCounterThreshold | number | 1 | AgingAllowed=true |
| | DemAgingCycleCounterThresholdForTFSLC | number | 0..1 | AgingAllowed=true |
| | DemAgingCycleRef | ref | 1 | AgingAllowed=true |
| 优先级 | DemDTCPriority | number | 1 | 1-256 |
| | DemDTCSignificance | enum | 1 | FAULT/OCCURRENCE |
| | DemImmediateNvStorage | boolean | 1 | - |
| 存储目的地 | DemMemoryDestinationRef | ref[] | 0..2 | Primary/Mirror/User |
| 冻结帧 | DemFreezeFrameClassRef | ref | 0..1 | - |
| | DemMaxNumberFreezeFrameRecords | number | 0..1 | 0-255 |
| 扩展数据 | DemExtendedDataClassRef | ref | 0..1 | - |

#### FR-Core-004: DemEventParameter 配置
**优先级**: P0

| 字段 | 类型 | 约束 |
|------|------|------|
| DemEventId | number | 1-65535, 自动生成, 唯一 |
| DemEventKind | enum | BSW/SWC |
| DemDTCRef | ref | 可选 → DemDTC |
| DemComponentClassRef | ref | 可选 → DemComponent |
| DemComponentPriority | number | 0-255 |
| DemDebounceAlgorithmClass | union | CounterBased/TimeBased |

#### FR-Core-005: Debounce 配置
**优先级**: P0

**计数器去抖**:
```typescript
interface DemDebounceCounterBasedClass {
  DemDebounceBehavior: 'FREEZE' | 'RESET';
  DemDebounceCounterFailedThreshold: number;   // 1-32767
  DemDebounceCounterPassedThreshold: number;   // -32768 to -1
  DemDebounceCounterIncrementStepSize: number; // 1-32767
  DemDebounceCounterDecrementStepSize: number; // 1-32768
  DemDebounceCounterJumpUp: boolean;
  DemDebounceCounterJumpUpValue?: number;
  DemDebounceCounterJumpDown: boolean;
  DemDebounceCounterJumpDownValue?: number;
  DemDebounceCounterStorage: boolean;
}
```

**时间去抖**:
```typescript
interface DemDebounceTimeBaseClass {
  DemDebounceBehavior: 'FREEZE' | 'RESET';
  DemDebounceTimeFailedThreshold: number;  // 0.001-3600s
  DemDebounceTimePassedThreshold: number; // 0.001-3600s
}
```

### 2.2 辅助功能模块 (FR-Assist)

#### FR-Assist-001: 配置向导
**优先级**: P1
- 6 步引导式配置流程
- 进度条显示
- 支持跳过和返回

#### FR-Assist-002: 引用关系管理
**优先级**: P1
- 树形视图展示配置结构
- 引用关系图（Graph 视图）
- 孤立项检测
- 悬空引用警告

#### FR-Assist-004: 配置验证
**优先级**: P0

**验证规则表**:
| 规则编号 | 规则描述 | 级别 | SWS 出处 |
|----------|----------|------|----------|
| R-001 | DemDebounceCounterFailedThreshold > 0 | Error | SWS 7.6.3.1 |
| R-002 | DemDebounceCounterPassedThreshold < 0 | Error | SWS 7.6.3.1 |
| R-003 | 计数器范围 -128 至 +127 | Error | SWS 7.6.3.1 |
| R-004 | 老化周期引用已定义的 OperationCycle | Error | SWS 7.6.10 |
| R-005 | DTC Value 不为 0x000000 | Error | SWS 7.4.2 |
| R-006 | DemEventId 唯一性 | Error | SWS 7.3 |
| R-007 | DemDTCAttributesRef 非空 | Error | SWS 10.2.28 |
| R-008 | AgingAllowed=true 时必须配置 AgingCycleRef | Error | SWS 10.2.28 |

#### FR-Assist-005: 导入/导出
**优先级**: P0
- 导出格式: JSON, ARXML (AUTOSAR 4.2.2), CSV
- 导入格式: JSON, ARXML
- 导入预览和冲突解决

### 2.3 用户界面需求 (FR-UI)

#### FR-UI-001: 布局
- 三栏布局（左:导航/中:表单/右:帮助）
- 响应式: 1366x768 及以上
- 暗色/亮色主题

#### FR-UI-002: 配置树导航
- 节点图标区分类型
- 状态标记: 已配置(绿)/警告(黄)/错误(红)
- 拖拽排序
- 右键菜单

#### FR-UI-003: 表单控件
- 根据参数类型自动选择控件
- 字段级帮助悬浮提示
- 分组可折叠

#### FR-UI-004: 搜索与筛选
- 全局搜索框
- 高级筛选（类型、状态、引用关系）
- 搜索结果高亮

---

## 3. 非功能需求 (NFR)

### 3.1 性能需求
| 需求编号 | 描述 | 验收标准 |
|----------|------|----------|
| NFR-PERF-001 | 页面加载 | ≤ 3s (4G网络) |
| NFR-PERF-002 | 配置项切换响应 | ≤ 200ms |
| NFR-PERF-003 | 大数据量 | 1000+ DTC 不卡顿 |
| NFR-PERF-004 | 导出性能 | 1000 DTC 的 ARXML ≤ 10s |

### 3.2 兼容性需求
| 需求编号 | 描述 | 验收标准 |
|----------|------|----------|
| NFR-COMP-001 | 浏览器 | Chrome 90+, Firefox 88+, Edge 90+ |
| NFR-COMP-002 | 移动端 | 支持 iPad/平板横屏（可选） |
| NFR-COMP-003 | 离线可用 | 配置编辑可离线进行 |

### 3.3 安全需求
| 需求编号 | 描述 | 验收标准 |
|----------|------|----------|
| NFR-SEC-001 | 本地数据安全 | 可选密码加密存储 |
| NFR-SEC-002 | 导入安全 | ARXML 导入防 XXE 攻击 |
| NFR-SEC-003 | 无后端依赖 | 纯前端实现 |

### 3.4 可用性需求
| 需求编号 | 描述 | 验收标准 |
|----------|------|----------|
| NFR-UX-001 | 撤销/重做 | Ctrl+Z/Y, 20 步历史 |
| NFR-UX-002 | 自动保存 | 30s 间隔到 LocalStorage |
| NFR-UX-003 | 快捷键 | 常用操作支持快捷键 |
| NFR-UX-004 | 新手引导 | 首次使用显示引导 Tour |

---

## 4. 数据模型

### 4.1 实体关系图

```
DemConfigSet (1)
├── DemDTC (0..n)
│   ├── DemDTCAttributesRef → DemDTCAttributes (1)
│   └── DemObdDTCRef → DemObdDTC (0..1)
├── DemDTCAttributes (0..n)
│   ├── DemFreezeFrameClassRef → DemFreezeFrameClass (0..1)
│   ├── DemExtendedDataClassRef → DemExtendedDataClass (0..1)
│   └── DemAgingCycleRef → DemOperationCycle (0..1)
├── DemEventParameter (0..n)
│   ├── DemDTCRef → DemDTC (0..1)
│   └── DemDebounceAlgorithmClass → Counter/Time
├── DemDebounceCounterBasedClass (0..n)
├── DemDebounceTimeBaseClass (0..n)
└── DemOperationCycle (0..n)
```

### 4.2 JSON Schema 规范

详见 `docs/internal-data-model.md`

---

## 5. 技术栈要求

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 | 3.4.x |
| 语言 | TypeScript | 5.2+ |
| UI | Element Plus | 2.4+ |
| 状态 | Pinia | 2.1+ |
| 存储 | LocalForage | 1.10+ |
| ARXML | fast-xml-parser | 4.x |
| 图形 | @vue-flow/core | 1.x |
| 构建 | Vite | 5.x |
| 测试 | Vitest | 1.x |

---

## 6. 验收测试用例

### TC-001: 创建完整 DTC 配置
**前置条件**: 打开工具，进入空白配置集  
**步骤**:
1. 创建 DemConfigSet "TestConfig"
2. 创建 DemDTCAttributes，AgingAllowed=true, Threshold=40
3. 创建 Counter Debounce，Failed=10, Passed=-10
4. 创建 DemDTC，DtcValue=0x123456
5. 创建 DemEventParameter 关联 DTC
6. 执行验证
7. 导出 JSON

**预期结果**: 验证通过，导出完整，重新导入一致

### TC-002: 引用完整性检查
**步骤**:
1. 创建 DTC 引用不存在的 Attributes
2. 触发验证

**预期结果**: 显示错误，提供创建快捷按钮

### TC-003: 批量操作
**步骤**:
1. 创建 10 个 DTC
2. 批量选择 5 个
3. 批量修改 Priority 为 50

**预期结果**: 5 个更新，其余不变

---

**版本**: 1.0.0  
**基于**: SRS_AUTOSAR_DTC_ConfigTool.md v1.0.0
