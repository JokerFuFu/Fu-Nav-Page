# Fu 导航 · 本机伴随服务（内网探测 / 本机硬件 / 提醒事项 / 日历 / AI 日报）

扩展是沙箱：探测内网服务会被 混合内容/自签证书/CORS 拦住而误判，也碰不到本机硬件和系统应用。这个零依赖 Node 伴随服务跑在你的 Mac 上补齐这些能力，通过 `127.0.0.1:7842` 提供给扩展。**只监听回环地址，其它设备/终端访问不到**；离开本机时扩展自动回退/隐藏相应功能。

- **内网在线检测**（`POST /probe`）：对一批 URL 做 TCP 直连探测，卡片状态点/失效检测据此标记——这才是真在线状态
- **本机硬件监控**（`GET /api/4/all`）：CPU/内存/磁盘/负载，Glances v4 兼容格式，硬件监控小组件端点填 `http://127.0.0.1:7842` 即可，无需装 Glances
- **提醒事项/日历/AI日报**（`GET /data`）：用系统自带 `osascript`（提醒事项）、`icalBuddy`（日历）、`claude`（AI 日报）抓成 JSON

## 安装

```bash
cd agent
./install.sh            # 装到 ~/.fu-nav 并注册 LaunchAgent（常驻 server + 每10分钟取数）
```

首次授权（**很重要**，否则提醒/日历为空）：

```bash
zsh ~/.fu-nav/build.sh  # 手动跑一次，弹窗点「允许」控制 提醒事项/日历
```

并在 **系统设置 → 隐私与安全性 → 提醒事项 / 日历 / 自动化** 里给 `node`、`osascript` 勾上权限。

可选增强：
- 日历：`brew install ical-buddy`（不装则日历留空）
- AI 日报：需已安装 Claude Code CLI（`claude`）；每天 8:00 自动基于当天提醒/日历生成 `{summary, top3, focus}`

## 端点

| 端点 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/probe` | POST | X-Token | `{targets:["http://ip:port",...]}` → `{results:{url:true/false}}`，TCP 直连探测（2.5s 超时，12 并发，上限 200 个） |
| `/api/4/all` | GET | 免 | 本机硬件（Glances v4 兼容：cpu/mem/fs/load/uptime），缓存 4s；免 token 是因为 fetchGlances 不带自定义头且仅回环可达 |
| `/data` | GET | X-Token | 提醒/日历/AI日报（build.sh 生成） |
| `/health` | GET | X-Token | `{ok,probe,hw}` |

## 数据格式（`GET /data`，需 `X-Token` 头）

```json
{
  "reminders": [{ "list":"工作", "name":"...", "due":"2026-...", "priority":0 }],
  "calendar":  [{ "when":"2026-06-29 at 14:00 - 15:00", "title":"...", "location":"" }],
  "report":    { "summary":"...", "top3":["..."], "focus":"..." },
  "generatedAt": "2026-..."
}
```

## 安全

- `server.js` 仅 `listen(127.0.0.1)`；`X-Token` 收口（默认 `fu-nav-local`，可用环境变量 `FN_TOKEN` 改，扩展设置里填同一个）。
- CORS 默认 `*`（本机单用户场景够用）；要更严把 `FN_ORIGIN` 设成 `chrome-extension://<你的扩展ID>`。
- 数据落在 `~/.fu-nav`，**不要**把它挪进网盘同步目录（iCloud / Synology Drive 等——云端 dataless 占位文件会卡死读取）。

## 卸载

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.fu.nav.server.plist
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.fu.nav.build.plist
rm -rf ~/.fu-nav ~/Library/LaunchAgents/com.fu.nav.*.plist
```

## 与扩展的接线

扩展侧 `shared/agent.js` 提供 `fetchAgentData()`（/data）与 `agentProbe()`（/probe），统一经 `localFetch` 请求：先裸 fetch，失败再按 `loopback→local` 补 `targetAddressSpace` 声明重试——不同 Chrome 版本 LNA/PNA 对回环地址空间的枚举名不一致（旧叫 local、新叫 loopback），声明错会直接 Failed to fetch。

- 状态点（`core.probeStatus`）与失效检测（`shared/link-check.js`）：内网条目攒批走 `agentProbe`；agent 没跑时状态点回退 favicon Image 探测、失效检测则跳过内网不乱标
- 硬件监控小组件（`shared/hwmon.js fetchGlances`）：端点填 `http://127.0.0.1:7842` 即读本机
- 「今日提醒 / 日程 / AI 日报」小组件：取不到 /data（没装/不在本机）则隐藏
