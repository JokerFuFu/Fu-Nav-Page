# 原收藏恢复与首页居中验收记录

日期：2026-08-09

## 自动化门禁

| 验证 | 结果 |
| --- | --- |
| `node --test tests/bookmark-recovery.test.mjs` | 3/3 通过；同名目录择大、深层展平、严格 URL 去重、元数据保留、幂等与权限边界均通过 |
| `node --test tests/responsive-static.test.mjs` | 首页主任务容器、6/8/4 列残行居中与移动端顶部安全区契约通过 |
| `npm test` | 76/76 通过，0 失败 |
| `npm run verify:static` | spec、plan、eval、离线图标边界与权限披露全部通过 |
| `npm run verify:e2e` | 真实 Manifest V3 扩展、全新 Chromium profile 通过，console error 0 |
| `git diff --check` | 通过 |

## 收藏恢复证据

- 浏览器书签树注入两份同名 `Fu 导航` 文件夹，自动选择后代网站数量更多的一份。
- 目标分组原有条目保留稳定 ID、用户名称、备注与标签。
- 从旧目录恢复 2 个缺失 URL；目录内与当前配置中的规范化重复 URL 均未重复追加。
- 第二次启动后目标分组仍为 3 条，ID 唯一，证明恢复幂等。
- 自动链路调用 `chrome.permissions.contains`，权限请求次数为 0；`bmSync.enabled` 保持 `false`。

## 首页几何证据

无组件、六个常用收藏、8 列规格：

| 视口 | 搜索水平偏差 | 主舞台垂直偏差 | 主任务内容垂直偏差 | 六卡残行偏差 | 横向溢出 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1024×768 | 0px | 0px | 0px | 0px | 0px |
| 1440×900 | 0px | 0px | 0px | 0px | 0px |
| 2048×955 | 0px | 0px | 0px | 0px | 0px |

390×844 移动端：主任务顶部为 72px，文档宽度为 390px，无横向溢出。

## 结论

`HOTFIX-BOOKMARK-001`、`HOTFIX-LAYOUT-001`、`HOTFIX-E2E-001` 的可执行断言均已满足，可以只翻转对应 `passes` 字段。
