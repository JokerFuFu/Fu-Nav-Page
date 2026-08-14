# 原收藏目录结构恢复验收记录

日期：2026-08-09

## 自动化门禁

| 验证 | 结果 |
| --- | --- |
| `node --test tests/bookmark-recovery.test.mjs` | 7/7 通过 |
| `npm test` | 80/80 通过，0 失败 |
| `npm run verify:static` | spec、plan、eval、离线边界与权限披露通过 |
| `npm run verify:e2e` | 真实 Manifest V3 扩展、全新 Chromium profile 通过，console error 0 |
| `git diff --check` | 通过 |

## 原目录迁移证据

- 预置上一版 `bookmarkRecoveryV326: true` 的扁平分组，证明已平铺用户仍会进入新迁移。
- 浏览器源包含 `旧子目录 / 更深目录`；迁移后深层网站从 UI 中可逐级进入。
- 迁移前 4 个网站，迁移后仍为 4 个；4 个网站 ID 全部复用。
- 用户名称、备注和标签未被浏览器来源标题覆盖。
- 源目录外的 1 个网站进入 `未归类`，没有删除。
- 第二次启动的节点 ID 与路径序列完全一致。
- 浏览器目录超过两级时，后续层级折叠成带完整相对路径名的第二级兄弟目录，`validateConfig` 仍通过。
- 自动迁移权限请求数为 0，`bmSync.enabled` 保持 `false`。

## 完全扁平源兜底证据

- 浏览器源文件夹数为 0 时，7 个代表网站被拆入：`网络与设备`、`AI 与效率`、`开发工具`、`设计创意`、`邮箱通讯`、`影音娱乐`、`其他`。
- 分类前后网站数均为 7，7 个稳定 ID 与备注全部复用。
- 分类后 `Fu 导航` 根层只包含语义文件夹，不再包含整批平铺网站。
- 自动分类不联网、不请求权限；真实扩展场景权限请求数为 0。

## 结论

`HOTFIX-BOOKMARK-STRUCTURE-001`、`HOTFIX-BOOKMARK-STRUCTURE-E2E-001`、`HOTFIX-BOOKMARK-AUTO-CATEGORY-001` 的可执行断言均已满足，可以只翻转对应 `passes` 字段。
