# Fu 导航 · 场景模式 + 引导 v2 Eval（验收判据合约）

> **铁律**：判据**只增不删不改**；执行 agent 只许翻 `passes`。本轮全部条目〔预览〕可验（`python3 -m http.server 8000` + newtab.html），无真机专属项。
> 配套：spec `2026-07-11-scene-modes-and-tour-v2-design.md` ｜ plan `2026-07-11-scene-modes-and-tour-v2.md`

## M · 场景模式

- [ ] **M-1** `passes:false` 断言：构造含旧字段的配置（两个分组 `page:'工作'`、`settings.activePage:'工作'`）写入 localStorage 后刷新 → `settings.modes` 出现名为「工作」的模式且 `groupIds` 恰为那两个分组 id、`activeMode` 为其 id；同法构造 `privacy:true` → `activeMode==='privacy'`；迁移后配置中 `g.page`/`activePage`/`privacy` 字段全部不存在。验证：DevTools 写数据+刷新+读 localStorage。
- [ ] **M-2** `passes:false` 断言：新建模式勾选部分分组后切换到该模式 → 侧栏与主区只显示勾选分组；切回「全部收藏」全量恢复；切「隐私模式」只留搜索/天气且 active 归位 home；刷新后 activeMode 持久。验证：操作 + DOM 断言。
- [ ] **M-3** `passes:false` 断言：某模式隐藏「天气」小组件并关闭常用区 → 切到该模式首页无天气卡、无常用区整块；切回全部两者恢复；`grep -rn "settings\.privacy\|activePage\|derivePages" shared/ layouts/ popup.js` 除 migrate 迁移块外零命中。验证：操作 + grep。
- [ ] **M-4** `passes:false` 断言：管理模式弹层可新建（promptModal）/改名/勾选分组与小组件/切常用区开关，全部即改即生效并持久；分组右键「所属模式」为勾选式（sel 态），点击可加入/移出且 toast 反馈；390px 宽弹层不破版。验证：操作。
- [ ] **M-5** `passes:false` 断言：删除模式出现带「撤销」toast，撤销后模式完整恢复（groupIds/hiddenWidgets/showFavs 原样、若删除前正激活则恢复激活）；删除分组后其 id 从所有模式的 groupIds 消失，撤销分组删除后又恢复回原模式。验证：操作 + localStorage 断言。

## T · 引导 v2

- [ ] **T-1** `passes:false` 断言：完成/跳过引导后，从 设置→高级→重看新手引导 触发 → 设置弹窗**自动关闭**、第 1 步正常高亮侧栏（无弹窗遮挡）；高亮元素 computed z-index=110 且视觉浮出遮罩带 accent 描边。验证：操作 + DevTools。
- [ ] **T-2** `passes:false` 断言：第 6 步自动打开设置弹窗且「同步与备份」区带光圈浮出（弹窗整体可见、backdrop 有 `.fn-tour-elevated`）；点上一步/下一步离开该步 → 设置弹窗自动关闭；第 4 步高亮底部模式切换钮；第 7 步无锚点居中结尾卡。验证：走完 7 步观察。
- [ ] **T-3** `passes:false` 断言：第 6 步（设置弹窗开着）按 Esc 退出 → 弹窗被关闭、`document.querySelectorAll('.fn-tour-hl,.fn-tour-elevated,.fn-tour-mask,.fn-tour-pop').length===0`；reduced-motion 模拟下无呼吸动画仍可完整走完；深浅双主题气泡可读。验证：操作 + DevTools 断言。

## 全局与端到端

- [ ] **G-1** `passes:false` 断言：六界面（首页/分组页/文件夹页/设置含模式管理弹层/命令面板/popup）×双主题 console 无红错（favicon 外链 CORP 噪音除外）、无破版；命令面板在任意模式下仍能搜到全部分组与网站（不受模式过滤）。验证：走查。
- [ ] **G-2** `passes:false` 断言：manifest version `3.22.0` 且 JSON 合法；本轮每任务独立中文 commit、作者全为 noreply；图标语言 grep 零新增违规。验证：`git log --format='%h %ae %s' -8` + grep。
- [ ] **E2E-1** `passes:false` **端到端组合**断言：清空数据首启 → 走完 7 步引导（含第 6 步设置内高亮）→ 建「学习」「工作」两模式（学习：2 分组+隐藏天气+关常用区）→ 一个分组同时勾进两模式 → 切学习验证三层过滤 → 切隐私 → 回全部 → 删「工作」模式并撤销 → 刷新：全部状态持久正确（onboarded=true、两模式在、多属分组在两模式中、学习模式配置原样）。全程 console 无红错。验证：按序走完。

---

**统计**：9 条，全部预览可验。完成定义：9/9 `true` 后交付；判据修改需人批准。
