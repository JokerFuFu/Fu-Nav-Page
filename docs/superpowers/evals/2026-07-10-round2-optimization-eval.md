# Fu 导航 · 第二轮优化 Eval（验收判据合约）

> **铁律**：本文件判据**只增不删不改**。执行 agent（codex）只许把 `passes` 翻 `true/false`；判据本身要改必须人确认。真机专属项没条件验证时**保持 false 并在 PR 注明待验**，禁止假翻。
> 配套：spec `docs/superpowers/specs/2026-07-10-round2-optimization-design.md` ｜ plan `docs/superpowers/plans/2026-07-10-round2-optimization.md`
> 环境标记：〔预览〕=`python3 -m http.server 8000` 打开 newtab.html 可验；〔真机〕=需 chrome://extensions 加载已解压。

## W1 · AI 搜索词

- [ ] **W1-1** `passes:false` 〔预览〕断言：选 Kimi 输入「测试问题」回车后，原页面出现内容含「已复制」的 toast（若 5.1 实测 Kimi 已支持 URL 直填则断言改为验证 q 模板生效——该改动需在 PR 注明实测证据）。验证：预览操作 + 截图。
- [ ] **W1-2** `passes:true` 〔预览〕断言：Bing / ChatGPT 等 `q:` 模板类 provider 搜索时**不**出现复制类 toast。验证：逐一试搜观察。

## W2 · 壁纸源

- [ ] **W2-1** `passes:true` 〔预览〕断言：背景面板在线源列表 ≥13 项（bing + alcy 11 分类 + picsum），分组展示、当前源高亮；alcy 各项 endpoint 与 t.alcy.cc 文档页路径一一对应（ycy/moez/ai/ysz/pc/moe/fj/bd/ys/acg/mp）。验证：打开面板数一遍 + `grep -c "t.alcy.cc" shared/background.js` ≥11。
- [ ] **W2-2** `passes:true` 〔预览〕断言：动漫类默认源为 `/ycy`。验证：`grep -n "ycy" shared/background.js` 出现在默认常量；清 localStorage 后切「在线壁纸」默认落在 ycy。
- [ ] **W2-3** `passes:true` 〔预览〕断言：自定义源填 `https://picsum.photos/1200/800` 可成功换图落盘；填 `https://example.com` 弹明确错误 toast 且 `settings.background.onlineSrc` 未变。验证：两次操作 + DevTools 查 localStorage。
- [ ] **W2-4** `passes:true` 〔预览〕断言：更新频率选「15 分钟」，把 `settings.background.lastFetchAt` 手改为 20 分钟前并刷新 → Network 出现对当前源的图片请求且 `lastFetchAt` 被更新；改为 5 分钟前刷新 → 无新请求。验证：DevTools Network + localStorage。

## W3 · 常用区

- [ ] **W3-1** `passes:true` 〔预览〕断言：默认网格 8×2；设置切 6×3 后首屏常用区列数=6 且最多 18 个，刷新后保持。验证：DevTools 数 DOM + `getComputedStyle` 列数。
- [ ] **W3-2** `passes:true` 〔预览〕断言：对某非锁定站连点 5 次（每次都真打开），刷新后它在自动段排位早于点击 0 次的站；且其 `freq>0`、`lastVisit` 为近时间戳（立即落盘，无需等防抖）。验证：操作 + localStorage 查 item 字段。
- [ ] **W3-3** `passes:true` 〔预览〕断言：右键卡片「锁定到常用」→ 卡片出现 pin 角标且固定在锁定段；「取消锁定」后角标消失并按 frecency 归位。验证：操作观察。
- [ ] **W3-4** `passes:true` 〔预览〕断言：`grep -rn "moreFav\|更多常用" layouts/ shared/ popup.js` 零命中；常用超过一屏规格时不出现折叠卡。验证：grep + 界面。
- [ ] **W3-5** `passes:true` 〔预览〕断言：390px 宽下常用区自动降列不横向溢出。验证：DevTools 响应式模式。

## W4 · 归档

- [ ] **W4-1** `passes:true` 〔预览〕断言：归档任一分组后侧栏不再出现任何归档区块；`grep -n "buildArchiveSection" layouts/fusion.js` 零命中。验证：操作 + grep。
- [ ] **W4-2** `passes:true` 〔预览〕断言：⌘K 搜归档分组名可见「已归档」标注且回车直达其分组页；设置→高级→归档管理列出该分组并可一键取消归档（分组回到侧栏）。验证：操作。

## W5 · WebDAV 多备份

- [ ] **W5-1** `passes:false` 〔真机+真实 WebDAV〕断言：点两次「立即备份到云」→ 服务器目录新增两个 `fu-nav-backup-YYYYMMDD-HHmmss.json` 且 `fu-nav-config.json` 的 mtime 未因此改变。验证：WebDAV 目录列表。
- [ ] **W5-2** `passes:false` 〔真机〕断言：目录中 backup 文件 >10 份时，再手动备份后仅剩最近 10 份。验证：预置 11 份假文件再备份。
- [ ] **W5-3** `passes:false` 〔真机〕断言：「从云恢复」弹出备份列表（含固定文件+全部时间戳备份，显示时间与大小），选择任意历史份恢复成功且配置生效；列目录失败时回退恢复固定文件并有说明文案。验证：操作恢复一份旧备份。

## W6 · 书签去重

- [ ] **W6-1** `passes:false` 〔真机〕断言：手工把「Fu 导航」根文件夹复制成两份后触发一次导出 → 书签栏只剩一个该名文件夹。验证：书签管理器。
- [ ] **W6-2** `passes:false` 〔真机〕断言：某分组镜像文件夹内手工复制两条相同书签后触发导出 → 同层同 URL 只剩一条。验证：书签管理器。
- [ ] **W6-3** `passes:false` 〔真机〕断言：同时开两个新标签页、在其一快速连续增删条目触发多次导出 → 书签树无重复（互斥锁生效）；`chrome.storage.local` 的 `bm_lock` 在导出结束后被清除。验证：操作 + storage 查看。

## W7 · 新手引导

- [ ] **W7-1** `passes:true` 〔预览〕断言：`localStorage.clear()` 刷新（全新用户）→ 自动进入 5 步引导；步进/上一步/跳过/Esc 均正常；完成或跳过后 `settings.onboarded===true` 且刷新不再出现。验证：操作 + localStorage。
- [ ] **W7-2** `passes:true` 〔预览〕断言：深/浅两主题下引导气泡与遮罩可读不破版；DevTools 模拟 `prefers-reduced-motion: reduce` 时无过渡动画仍可正常走完；设置→高级「重看新手引导」可再次触发。验证：操作。

## W8 · 删除撤销

- [ ] **W8-1** `passes:false` 〔预览〕断言：删除 网站条目 / 含子项的文件夹 / 分组 / 小组件 四类各出现带「撤销」按钮的 toast，停留约 5 秒。验证：四次操作。
- [ ] **W8-2** `passes:false` 〔预览〕断言：每类删除后 5 秒内点「撤销」→ 完整恢复到原位置（文件夹内条目回原文件夹原顺序；分组回原侧栏位置），刷新后仍在且不再有该项的墓碑残留（后续 popup 收件箱不误杀——可通过再次正常删除→确认能删来间接验证）。验证：四次撤销 + 刷新。
- [ ] **W8-3** `passes:false` 〔预览〕断言：不点撤销任 toast 消失 → 刷新后删除持久生效不复活。验证：操作。

## 全局与端到端

- [ ] **G-1** `passes:false` 〔预览〕断言：全量回归（首页/分组页/文件夹页/设置含 3 个新子弹层/命令面板/popup × 深浅双主题）console 无红错、无破版。验证：逐界面走查。
- [ ] **G-2** `passes:true` 〔预览〕断言：图标语言零新增违规——`grep -rnE "textContent *=.*['\"][▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓]|innerHTML *=.*[▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓]" shared/ layouts/ popup.js | grep -v mico` 输出为空。验证：命令。
- [ ] **G-3** `passes:true` 〔预览〕断言：manifest version 为 `3.21.0` 且 `python3 -m json.tool manifest.json` 通过；每任务独立 commit、全部为中文 message、作者邮箱为 noreply。验证：`git log --format='%h %ae %s' -10`。
- [ ] **E2E-1** `passes:false` 〔预览〕**端到端组合**断言：清空数据全新启动 → 走完新手引导 → 切换壁纸源到 alcy/fj 并设 15 分钟频率 → 连点某站 5 次 + 锁定另一站 → 切 6×3 规格 → 删除一个分组并撤销 → 归档另一分组后从 ⌘K 直达：全程 console 无红错，最终刷新后以上状态全部持久正确（引导不再弹/源与频率保持/frecency 排序生效/锁定与规格保持/撤销的分组完好/归档分组不在侧栏）。验证：按序走完一遍。
- [ ] **E2E-2** `passes:false` 〔真机〕**端到端组合**断言：开书签双向同步 + WebDAV：制造书签重复 → 导出收敛单份 → 手动云备份两次 → 从列表恢复较旧一份 → 配置回退成功且书签树随之重新对齐无重复。验证：真机走完一遍。

---

**统计**：预览可验 17 条 / 真机专属 7 条（W5×3、W6×3、E2E-2）。完成定义：预览 17 条全 `true` 且真机项如实标注状态后交付；真机项由用户在真实扩展环境复核后翻牌。
