# AUTOSAR BSW Config Tool

基于网页的 AUTOSAR 基础软件配置工具，支持 DEM、DCM、NvM 等 BSW 模块的可视化配置。

## 功能特性

- 🎨 可视化配置界面
- 📄 符合 AUTOSAR 4.2.2 规范的 ARXML 导入导出
- 🔒 纯前端实现，数据本地存储
- 🌙 支持暗色/亮色主题
- 📱 响应式布局

## 技术栈

- Vue 3 + TypeScript (Composition API)
- Element Plus (UI 组件库)
- Pinia (状态管理)
- Vite (构建工具)
- LocalForage (IndexedDB 封装)
- fast-xml-parser (ARXML 处理)

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
autosar-bsw-config-tool/
├── docs/                   # 文档
│   ├── ARCHITECTURE.md     # 架构设计文档
│   ├── REQUIREMENTS.md     # 需求文档
│   ├── internal-data-model.md  # 数据模型定义
│   └── CODEX-TASK-TEMPLATE.md  # 任务模板
├── src/
│   ├── components/         # 公共组件
│   ├── modules/            # BSW 模块 (dem/dcm/nvm...)
│   ├── stores/             # Pinia stores
│   ├── utils/              # 工具函数
│   ├── views/              # 页面视图
│   ├── router/             # 路由配置
│   └── types/              # TypeScript 类型定义
├── tests/                  # 测试文件
├── project-engineering-file.md  # 项目工程档案
└── package.json
```

## 开发阶段

- Phase 1: 项目骨架与数据模型 ✅
- Phase 2: 核心配置模块 🚧
- Phase 3: ARXML 规范支持
- Phase 4: UI/UX 完善
- Phase 5: 测试与验收

## 文档

- [架构设计文档](./docs/ARCHITECTURE.md)
- [需求文档](./docs/REQUIREMENTS.md)
- [数据模型定义](./docs/internal-data-model.md)
- [项目工程档案](./project-engineering-file.md)

## 许可证

MIT License
