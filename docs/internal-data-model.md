# AUTOSAR BSW Config Tool - 内部数据模型定义

## 1. 基础类型定义

```typescript
// types/base.ts

/**
 * UUID 类型
 * 所有 AUTOSAR 元素必须有唯一 UUID (RFC4122 v4)
 */
export type UUID = string;

/**
 * ECUC 参数引用路径
 * 格式: /AUTOSAR/EcucDefs/{Module}/{Container}/{Parameter}
 */
export type EcucRef = string;

/**
 * 短名称 (Short-Name)
 * AUTOSAR 标识符，符合 C 语言命名规范
 */
export type ShortName = string;

/**
 * 配置类
 */
export enum ConfigClass {
  PRE_COMPILE = 'VARIANT-PRE-COMPILE',
  LINK_TIME = 'VARIANT-LINK-TIME',
  POST_BUILD = 'VARIANT-POST-BUILD'
}

/**
 * 多重性定义
 */
export interface Multiplicity {
  lower: number;
  upper: number | 'unbounded';
}

/**
 * 基础 ECUC 元素
 */
export interface EcucElement {
  uuid: UUID;
  shortName: ShortName;
  description?: string;
}
```

## 2. DEM 模块数据模型

### 2.1 DemConfigSet (配置集)

```typescript
// modules/dem/models/DemConfigSet.ts

import { EcucElement, UUID } from '@/types/base';

export interface DemConfigSet extends EcucElement {
  // 元数据
  version: string;
  lastModified: number;  // Unix timestamp
  
  // 子元素
  demDTCs: DemDTC[];
  demDTCAttributes: DemDTCAttributes[];
  demEventParameters: DemEventParameter[];
  demDebounceCounterBasedClasses: DemDebounceCounterBasedClass[];
  demDebounceTimeBasedClasses: DemDebounceTimeBasedClass[];
  demFreezeFrameClasses: DemFreezeFrameClass[];
  demExtendedDataClasses: DemExtendedDataClass[];
  demOperationCycles: DemOperationCycle[];
}

// 创建工厂函数
export function createDemConfigSet(shortName: string): DemConfigSet {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    version: '1.0.0',
    lastModified: Date.now(),
    demDTCs: [],
    demDTCAttributes: [],
    demEventParameters: [],
    demDebounceCounterBasedClasses: [],
    demDebounceTimeBasedClasses: [],
    demFreezeFrameClasses: [],
    demExtendedDataClasses: [],
    demOperationCycles: []
  };
}
```

### 2.2 DemDTC (诊断故障码)

```typescript
// modules/dem/models/DemDTC.ts

import { EcucElement, UUID } from '@/types/base';

/**
 * DTC 严重程度枚举
 */
export enum DemDTCSeverity {
  NO_SEVERITY = 'DEM_SEVERITY_NO_SEVERITY',
  CHECK_IMMEDIATELY = 'DEM_SEVERITY_CHECK_IMMEDIATELY',
  CHECK_AT_NEXT_HALT = 'DEM_SEVERITY_CHECK_AT_NEXT_HALT',
  MAINTENANCE_ONLY = 'DEM_SEVERITY_MAINTENANCE_ONLY'
}

/**
 * WWH-OBD DTC 分类枚举
 */
export enum DemWWHOBDDTCClass {
  NOCLASS = 'DEM_DTC_WWHOBD_CLASS_NOCLASS',
  CLASS_A = 'DEM_DTC_WWHOBD_CLASS_A',
  CLASS_B1 = 'DEM_DTC_WWHOBD_CLASS_B1',
  CLASS_B2 = 'DEM_DTC_WWHOBD_CLASS_B2',
  CLASS_C = 'DEM_DTC_WWHOBD_CLASS_C'
}

export interface DemDTC extends EcucElement {
  // DTC 值 (3字节十六进制)
  demDtcValue: number;  // 存储为 number，显示为 0x123456
  
  // 功能单元 (1字节，可选)
  demDTCFunctionalUnit?: number;  // 0-255
  
  // 严重程度
  demDTCSeverity: DemDTCSeverity;
  
  // WWH-OBD 分类
  demWWHOBDDTCClass?: DemWWHOBDDTCClass;
  
  // 引用关系 (存储 UUID)
  demDTCAttributesRef: UUID;  // 必填
  demObdDTCRef?: UUID;        // 可选
  demJ1939DTC_J1939NodeRef?: UUID;  // 可选 (J1939)
}

// 验证规则
export const DemDTCValidationRules = {
  demDtcValue: {
    min: 0x000001,
    max: 0xFFFFFF,
    format: 'hex',
    pattern: /^0x[0-9A-Fa-f]{6}$/,
    reserved: [0x000000]  // 保留值黑名单
  },
  demDTCFunctionalUnit: {
    min: 0,
    max: 255,
    optional: true
  }
};

// 创建工厂
export function createDemDTC(shortName: string): DemDTC {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDtcValue: 0x000001,
    demDTCSeverity: DemDTCSeverity.NO_SEVERITY,
    demDTCAttributesRef: ''  // 创建时必须关联
  };
}
```

### 2.3 DemDTCAttributes (DTC 属性)

```typescript
// modules/dem/models/DemDTCAttributes.ts

import { EcucElement, UUID, ConfigClass } from '@/types/base';

/**
 * 事件重要性
 */
export enum DemEventSignificance {
  FAULT = 'DEM_EVENT_SIGNIFICANCE_FAULT',
  OCCURRENCE = 'DEM_EVENT_SIGNIFICANCE_OCCURRENCE'
}

/**
 * 存储目的地
 */
export enum DemMemoryDestination {
  PRIMARY = 'DemPrimaryMemory',
  MIRROR = 'DemMirrorMemory',
  USER_DEFINED = 'DemUserDefinedMemory'
}

export interface DemDTCAttributes extends EcucElement {
  // 老化配置
  demAgingAllowed: boolean;
  demAgingCycleCounterThreshold?: number;        // 1-256, AgingAllowed=true 时必填
  demAgingCycleCounterThresholdForTFSLC?: number; // 1-256, 可选
  demAgingCycleRef?: UUID;                        // AgingAllowed=true 时必填
  
  // 优先级与存储
  demDTCPriority: number;                         // 1-256, 值越小优先级越高
  demDTCSignificance: DemEventSignificance;
  demImmediateNvStorage: boolean;
  demMemoryDestinationRef: DemMemoryDestination[]; // 0..2
  
  // 冻结帧配置
  demFreezeFrameClassRef?: UUID;
  demFreezeFrameRecNumClassRef?: UUID;
  demMaxNumberFreezeFrameRecords?: number;        // 0-255
  demEventMemoryEntryFdcThresholdStorageValue?: number;  // 1-126
  
  // 扩展数据配置
  demExtendedDataClassRef?: UUID;
  
  // WWH-OBD / J1939 专用
  demWWHOBDFreezeFrameClassRef?: UUID;
  demJ1939FreezeFrameClassRef?: UUID;
  demJ1939ExpandedFreezeFrameClassRef?: UUID;
}

// 条件字段联动配置
export const DemDTCAttributesDependencies = [
  {
    parent: 'demAgingAllowed',
    condition: { operator: 'eq', value: true },
    children: [
      'demAgingCycleCounterThreshold',
      'demAgingCycleCounterThresholdForTFSLC',
      'demAgingCycleRef'
    ],
    behavior: 'enable'  // parent=true 时启用，否则禁用
  },
  {
    parent: 'demFreezeFrameRecNumClassRef',
    condition: { operator: 'exists', value: true },
    children: ['demMaxNumberFreezeFrameRecords'],
    behavior: 'enable'
  }
];

// 创建工厂
export function createDemDTCAttributes(shortName: string): DemDTCAttributes {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demAgingAllowed: false,
    demDTCPriority: 128,
    demDTCSignificance: DemEventSignificance.FAULT,
    demImmediateNvStorage: false,
    demMemoryDestinationRef: []
  };
}
```

### 2.4 DemEventParameter (事件参数)

```typescript
// modules/dem/models/DemEventParameter.ts

import { EcucElement, UUID } from '@/types/base';

/**
 * 事件类型
 */
export enum DemEventKind {
  BSW = 'DEM_EVENT_KIND_BSW',
  SWC = 'DEM_EVENT_KIND_SWC'
}

/**
 * 去抖算法类型
 */
export enum DemDebounceType {
  NONE = 'NONE',
  COUNTER_BASED = 'COUNTER_BASED',
  TIME_BASED = 'TIME_BASED',
  MONITOR_INTERNAL = 'MONITOR_INTERNAL'
}

export interface DemEventParameter extends EcucElement {
  demEventId: number;           // 1-65535, 自动生成，唯一
  demEventKind: DemEventKind;
  
  // 引用关系
  demDTCRef?: UUID;             // 可选
  demComponentClassRef?: UUID;  // 可选
  demComponentPriority?: number;  // 0-255
  demEnableConditionGroupRef?: UUID;  // 可选
  
  // 功能开关
  demEventAvailable: boolean;   // 默认 true
  demEventFailureCycleCounterThreshold: number;  // 0-255, 默认 0
  demFFPrestorageSupported: boolean;
  
  // 去抖算法
  demDebounceAlgorithm: {
    type: DemDebounceType;
    // 根据类型存储不同引用
    counterRef?: UUID;  // type=COUNTER_BASED
    timeRef?: UUID;       // type=TIME_BASED
  };
}

// ID 生成器 (自动递增，持久化)
let eventIdCounter = 1;

export function generateEventId(): number {
  return eventIdCounter++;
}

// 创建工厂
export function createDemEventParameter(shortName: string): DemEventParameter {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demEventId: generateEventId(),
    demEventKind: DemEventKind.SWC,
    demEventAvailable: true,
    demEventFailureCycleCounterThreshold: 0,
    demFFPrestorageSupported: false,
    demDebounceAlgorithm: { type: DemDebounceType.NONE }
  };
}
```

### 2.5 DemDebounceCounterBasedClass (计数器去抖)

```typescript
// modules/dem/models/DemDebounceCounterBasedClass.ts

import { EcucElement } from '@/types/base';

/**
 * 去抖行为
 */
export enum DemDebounceBehavior {
  FREEZE = 'DEM_DEBOUNCE_FREEZE',
  RESET = 'DEM_DEBOUNCE_RESET'
}

export interface DemDebounceCounterBasedClass extends EcucElement {
  demDebounceBehavior: DemDebounceBehavior;
  demDebounceCounterFailedThreshold: number;      // 1-32767
  demDebounceCounterPassedThreshold: number;      // -32768 to -1
  demDebounceCounterIncrementStepSize: number;    // 1-32767
  demDebounceCounterDecrementStepSize: number;      // 1-32768
  demDebounceCounterJumpUp: boolean;
  demDebounceCounterJumpUpValue?: number;         // -32768 to 32767, JumpUp=true 时
  demDebounceCounterJumpDown: boolean;
  demDebounceCounterJumpDownValue?: number;       // -32768 to 32767, JumpDown=true 时
  demDebounceCounterStorage: boolean;
}

// 验证规则 (R-001, R-002, R-003)
export const DemDebounceCounterValidationRules = {
  demDebounceCounterFailedThreshold: {
    min: 1,
    max: 32767,
    mustBePositive: true  // R-001
  },
  demDebounceCounterPassedThreshold: {
    min: -32768,
    max: -1,
    mustBeNegative: true  // R-002
  },
  demDebounceCounterIncrementStepSize: {
    min: 1,
    max: 32767
  },
  demDebounceCounterDecrementStepSize: {
    min: 1,
    max: 32768
  }
};

// 创建工厂
export function createDemDebounceCounterBasedClass(shortName: string): DemDebounceCounterBasedClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDebounceBehavior: DemDebounceBehavior.FREEZE,
    demDebounceCounterFailedThreshold: 127,
    demDebounceCounterPassedThreshold: -127,
    demDebounceCounterIncrementStepSize: 1,
    demDebounceCounterDecrementStepSize: 1,
    demDebounceCounterJumpUp: false,
    demDebounceCounterJumpDown: false,
    demDebounceCounterStorage: false
  };
}
```

### 2.6 DemDebounceTimeBasedClass (时间去抖)

```typescript
// modules/dem/models/DemDebounceTimeBasedClass.ts

import { EcucElement } from '@/types/base';

export interface DemDebounceTimeBasedClass extends EcucElement {
  demDebounceBehavior: DemDebounceBehavior;
  demDebounceTimeFailedThreshold: number;   // 0.001-3600 seconds
  demDebounceTimePassedThreshold: number; // 0.001-3600 seconds
}

// 验证规则
export const DemDebounceTimeValidationRules = {
  demDebounceTimeFailedThreshold: {
    min: 0.001,
    max: 3600,
    unit: 's'
  },
  demDebounceTimePassedThreshold: {
    min: 0.001,
    max: 3600,
    unit: 's'
  }
};

// 创建工厂
export function createDemDebounceTimeBasedClass(shortName: string): DemDebounceTimeBasedClass {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demDebounceBehavior: DemDebounceBehavior.FREEZE,
    demDebounceTimeFailedThreshold: 0.5,
    demDebounceTimePassedThreshold: 0.5
  };
}
```

### 2.7 DemOperationCycle (操作周期)

```typescript
// modules/dem/models/DemOperationCycle.ts

import { EcucElement } from '@/types/base';

/**
 * 操作周期类型
 */
export enum DemOperationCycleType {
  IGNITION = 'DEM_OPCYC_IGNITION',
  OBD_DCY = 'DEM_OPCYC_OBD_DCY',
  WARMUP = 'DEM_OPCYC_WARMUP',
  POWER = 'DEM_OPCYC_POWER'
  // 可扩展自定义周期
}

export interface DemOperationCycle extends EcucElement {
  demOperationCycleType: DemOperationCycleType | string;  // string 支持自定义
}

// 创建工厂
export function createDemOperationCycle(
  shortName: string,
  type: DemOperationCycleType
): DemOperationCycle {
  return {
    uuid: generateUUID(),
    shortName,
    description: '',
    demOperationCycleType: type
  };
}
```

## 3. 完整配置根对象

```typescript
// models/AutosarConfig.ts

import { DemConfigSet } from '@/modules/dem/models/DemConfigSet';

/**
 * 完整的 AUTOSAR BSW 配置对象
 * 未来可扩展其他模块 (DcmConfig, NvMConfig, ...)
 */
export interface AutosarConfig {
  version: string;
  metadata: {
    createdAt: number;
    lastModified: number;
    toolVersion: string;
    autosarVersion: string;
  };
  
  // 各 BSW 模块配置
  dem: {
    configSets: DemConfigSet[];
  };
  
  // 未来扩展
  // dcm?: DcmConfig;
  // nvm?: NvMConfig;
  // ...
}

// 创建工厂
export function createAutosarConfig(): AutosarConfig {
  const now = Date.now();
  return {
    version: '1.0.0',
    metadata: {
      createdAt: now,
      lastModified: now,
      toolVersion: '0.1.0',
      autosarVersion: '4.2.2'
    },
    dem: {
      configSets: []
    }
  };
}
```

## 4. Store 类型定义

```typescript
// stores/types.ts

import { AutosarConfig } from '@/models/AutosarConfig';

/**
 * ConfigStore 状态
 */
export interface ConfigState {
  config: AutosarConfig | null;
  currentConfigSetId: string | null;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * 历史记录条目
 */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  action: string;
  snapshot: AutosarConfig;
}

/**
 * ConfigStore Actions
 */
export interface ConfigActions {
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  createConfigSet: (name: string) => void;
  deleteConfigSet: (id: string) => void;
  updateConfigSet: (id: string, updates: Partial<DemConfigSet>) => void;
  importFromJson: (json: string) => void;
  exportToJson: () => string;
  exportToArxml: () => string;
  undo: () => void;
  redo: () => void;
}
```

---

## 附录：UUID 生成

```typescript
// utils/uuid.ts

import { v4 as uuidv4 } from 'uuid';

export function generateUUID(): string {
  return uuidv4();
}

/**
 * 生成 AUTOSAR 风格的 UUID
 * 格式: ECUC:{uuid}
 */
export function generateEcucUUID(): string {
  return `ECUC:${uuidv4()}`;
}
```
