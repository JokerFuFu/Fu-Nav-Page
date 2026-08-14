# 工作区首页联动与时钟修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复工作区切换后首页收藏不联动和时钟开关开启但不显示，同时保持“全部收藏”首页完全不变。

**Architecture:** 收藏限域与时钟状态修复分别落在无 DOM 的纯函数中，Core 只负责提供当前模式和持久化用户动作；真实扩展 E2E 覆盖界面切换组合场景。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript ES Modules、Node.js `node:test`、Playwright 真实扩展 E2E。

## Autonomous Execution Contract

- 全过程自动执行，不请求用户人工查看、验收或批准。
- 严格按 RED → GREEN：先让新增测试在旧实现上失败，再修改生产代码。
- 验收合约的断言、验证方式和阈值只增不删不改；全部证据通过后只翻转 `passes`。
- 保留工作树已有无关改动，不重置、不覆盖；不修改当前全局首页收藏内容与顺序。

## Tasks

- [x] 固化 spec / plan / eval 三件套与不可变验收边界。
- [x] 为工作区收藏限域与全局首页等价性添加失败单元测试，并记录 RED。
- [x] 为时钟真实启用、幂等补齐和关闭保序添加失败单元测试，并记录 RED。
- [x] 实现收藏候选限域与 Core 接入，不复制排名算法。
- [x] 实现时钟状态纯函数与设置页接入。
- [x] 根据真实本地数据补充窄范围兼容迁移：只修复 showClock=true 且 clock 缺失，并让主动删除同步关闭开关。
- [x] 给当前用户优化备份显式补入一个时钟组件，不改其他首页数据。
- [x] 扩展真实浏览器 E2E，覆盖“全部收藏 → 工作区 → 全部收藏”与时钟可见。
- [x] 运行专项测试、`npm test`、`npm run verify:static`、`npm run verify:e2e`。
- [x] 按验收证据将 eval 的 `passes` 翻为 `true`，完成最终复核。
