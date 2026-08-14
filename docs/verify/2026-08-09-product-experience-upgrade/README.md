# 产品体验升级验收记录

日期：2026-08-09（Asia/Shanghai）

版本：3.26.0

分支：`codex/product-experience-upgrade`

验收入口：根目录 `eval.md`，共 58 条不可变判据。

## 自动化环境

- 使用全新临时 Chromium profile 加载本工作树的 Manifest V3 扩展，固定视口从 1024×768 切换至 390×844。
- 真实运行 newtab、popup、service worker、`chrome.storage.local/sync`、下载和 action badge；临时 profile 在脚本结束后自动删除。
- 浏览器原生权限气泡无法由无头 Chromium可靠操作，因此 P1-PERM-001 在真实扩展页内仅替换 `chrome.permissions` 与 `chrome.bookmarks` API 边界，分别注入拒绝、再次请求、授权和书签树；页面、状态持久化、拒绝后核心功能及再次授权路径均为生产代码。该检查不声称覆盖浏览器原生气泡自身的视觉样式。
- WebDAV 使用真实扩展网络请求，目标固定为 manifest 已授权的 `127.0.0.1:7842`；验收脚本在浏览器网络边界响应并记录 method、header 和正文，避免依赖用户本机服务状态。
- 测试数据中的账号、密码、Token、URL 与查询词均为每次生成的唯一假值，不写入本记录。

## 最终命令

| 命令 | 结果 |
|---|---|
| `npm test` | PASS，72/72，0 failed |
| `npm run verify:static` | PASS，spec / plan / eval、离线图标边界、manifest 披露全部通过 |
| `npm run verify:e2e` | PASS，5 条组合场景、权限拒绝/重试、390px 补充检查，console errors = 0 |
| `NODE_PATH=… node tools/offline-browser-check.cjs .` | PASS，45/45 图标本地可用，blank = 0，6 个核心表面，console errors = 0 |
| `git diff --check` | PASS |

## 组合场景证据

| 判据 | 自动步骤与结果 |
|---|---|
| P1-PERM-001 / E2E-001 | 首次选择书签导入 → 第一次请求拒绝 → 新标签页搜索及本地编辑仍可用 → 设置中再次启用并授权 → 递归导入成功；popup 保存到 `E2E Data / Level One / Level Two`，更新后仅一条记录，路径一致，当前 tab badge 为 `✓`。 |
| E2E-002 | 两个扩展页并发：A 删除 `delete-me`，B 用已打开的旧编辑器修改另一条并保存，再合并远端独有项并重载；删除项未复活、编辑项保留、远端项恰好一条、所有稳定 ID 唯一。 |
| E2E-003 | 输入唯一查询，连续切换 Provider 时打开数为 0 且文本不变；按 Enter 后只打开一次，目标 URL 使用最终 Provider 并保留原查询。 |
| E2E-004 | 1024×768 深浅主题的第八个常用项底边均为 183.875px，`scrollY = 0`；设置把 Provider 改为 Google 后持久化，popup 二级目录收藏仍在。随后切至 390×844，页面 `scrollWidth = 390`，Agent Token 字段和“完成”主操作均未裁切。 |
| E2E-005 | 唯一 WebDAV user/password 与 Agent Token 仅存在 `fn_secrets_v1`；local 安全配置、sync、WebDAV JSON 正文、导出和诊断命中数全部为 0，凭据只出现在已授权请求的 Authorization header。观察到 2 次 PUT 和 1 次 PROPFIND，console errors = 0。 |

## 视觉、响应式与离线矩阵

- 自动浏览器矩阵覆盖 1440×900、1268×714、1024×768、768×800、390×844；表面覆盖 home、group、folder、settings、palette、library、workspaces、popup，并检查深色、浅色和背景图模式。
- 5 个视口 × 8 个表面均满足 `scrollWidth <= innerWidth`，面板与 popup 主操作未裁切；760px 以下侧栏为带 scrim、关闭按钮、Escape 和 body scroll guard 的固定抽屉。
- 背景图深浅主题使用独立小字颜色与玻璃不透明度，最坏明暗背景下对比度不低于 4.5:1；reduced-motion 下非必要过渡归零。
- 断网扩展复跑覆盖 home、group、folder、editor、settings、popup：45 个可见核心图标全部为本地 data URL，无空白图标、无未捕获控制台错误。

## 结论

P0、P1、P2 及五条 E2E 合同全部由自动化证据覆盖；对应 `eval.md` 的 `passes` 只有在上述命令 exit 0 后才切换为 `true`。全程不需要用户人工查看、验收或批准。
