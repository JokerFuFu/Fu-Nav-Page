# Fu 导航 · 产品体验与可靠性升级 Eval Contract

```yaml
contract:
  version: 1
  created: 2026-08-09
  spec: docs/superpowers/specs/2026-08-09-product-experience-upgrade-design.md
  plan: docs/superpowers/plans/2026-08-09-product-experience-upgrade-plan.md
  completion_rule: 所有 criteria 的 passes 必须为 true
  mutation_policy: 只允许新增 criterion 或翻转 passes；已有 id、assertion、verification 和 threshold 不得删除或修改

criteria:
  - id: META-001
    priority: P0
    assertion: spec、plan、eval 三件套存在且互相引用，计划覆盖 P0、P1、P2
    verification:
      type: command
      run: npm run verify:static
      expected: trilogy rule PASS and exit 0
    passes: true

  - id: P0-SEC-001
    priority: P0
    assertion: WebDAV 用户名、密码、Agent token 和其他 secret 不存在于同步 config
    verification:
      type: command
      run: npm test -- tests/config-secrets.test.mjs
      expected: secret split and sanitize cases PASS
    passes: true

  - id: P0-SEC-002
    priority: P0
    assertion: 本地导出的备份 JSON 不包含密码、token、WebDAV user 字段或其真实值
    verification:
      type: combined
      run: npm test -- tests/config-secrets.test.mjs tests/diagnostics.test.mjs
      operation: 在设置中填写唯一测试 secret，导出备份后对文件搜索该 secret
      expected: commands exit 0 and exported file has zero matches
    passes: false

  - id: P0-SEC-003
    priority: P0
    assertion: WebDAV 和 Google Drive 上传载荷使用安全配置，不包含本机 secret
    verification:
      type: command
      run: npm test -- tests/config-secrets.test.mjs
      expected: cloud payload sanitization PASS
    passes: true

  - id: P0-SCHEMA-001
    priority: P0
    assertion: v2 配置可幂等迁移到 v3，迁移失败不会覆盖原配置
    verification:
      type: command
      run: npm test -- tests/config-schema.test.mjs
      expected: migration and idempotence cases PASS
    passes: true

  - id: P0-SYNC-001
    priority: P0
    assertion: 一个上下文删除嵌套项目后，另一个上下文持有的旧副本不能把该项目合并复活
    verification:
      type: command
      run: npm test -- tests/config-merge.test.mjs
      expected: tombstone wins stale node case PASS
    passes: false

  - id: P0-SYNC-002
    priority: P0
    assertion: 并发删除一个节点和编辑另一个节点时，合并结果同时保留删除与编辑
    verification:
      type: command
      run: npm test -- tests/config-merge.test.mjs
      expected: unrelated concurrent edit case PASS
    passes: false

  - id: P0-SYNC-003
    priority: P0
    assertion: 同一节点发生不可自动判定的并发更新时显示冲突，不静默覆盖任一远端版本
    verification:
      type: combined
      run: npm test -- tests/config-merge.test.mjs
      operation: 构造相同 updatedAt 的两份不同节点并触发云拉取
      expected: test PASS and UI offers merge/local/cloud choices
    passes: false

  - id: P0-HISTORY-001
    priority: P0
    assertion: 本机保存最近五份配置快照，第六份写入后淘汰最旧一份，任一保留快照可恢复
    verification:
      type: command
      run: npm test -- tests/config-history.test.mjs
      expected: retention and restore cases PASS
    passes: false

  - id: P0-IMPORT-001
    priority: P0
    assertion: 缺少 URL、非法树结构或损坏 JSON 的导入会被拒绝，当前配置保持不变
    verification:
      type: command
      run: npm test -- tests/config-import.test.mjs
      expected: invalid input cases PASS
    passes: false

  - id: P0-IMPORT-002
    priority: P0
    assertion: 导入和云恢复在应用前展示新增、更新、删除、重复、无效数量并创建快照
    verification:
      type: combined
      run: npm test -- tests/config-import.test.mjs tests/config-history.test.mjs
      operation: 导入包含五类差异的测试文件并观察预览 dialog
      expected: exact counts shown and cancel leaves config unchanged
    passes: false

  - id: P0-STORE-001
    priority: P0
    assertion: sync 配额不足时数据仍保存本机，设置诊断持续显示 local-only 状态与配置字节数
    verification:
      type: operation
      steps:
        - 使用测试桩令 chrome.storage.sync.set 返回 QUOTA_BYTES 错误
        - 编辑一个网站并保存
        - 重新打开设置诊断
      expected: website persists locally and diagnostics shows local-only with nonzero bytes
    passes: false

  - id: P0-PROVIDER-001
    priority: P0
    assertion: 输入内容后切换 Provider 不提交、不打开新页，输入内容保持原样
    verification:
      type: command
      run: npm test -- tests/provider.test.mjs
      expected: provider switch submits zero times
    passes: false

  - id: P0-PROVIDER-002
    priority: P0
    assertion: 设置页选择的搜索 Provider 与首页当前 Provider 使用同一 askProvider 状态
    verification:
      type: combined
      run: npm test -- tests/provider.test.mjs
      operation: 在设置中切换 Provider，关闭设置并检查首页按钮，再刷新页面
      expected: test PASS and selected provider remains identical after refresh
    passes: false

  - id: P0-FILTER-001
    priority: P0
    assertion: 分组和文件夹输入框只筛选当前内容，Enter 不执行外部搜索
    verification:
      type: combined
      run: npm test -- tests/provider.test.mjs
      operation: 在分组和二级文件夹分别输入筛选词并按 Enter
      expected: visible cards are filtered and no navigation or new tab occurs
    passes: false

  - id: P0-LOCK-001
    priority: P0
    assertion: 锁定状态下卡片和分组没有 draggable、抓取光标、编辑按钮或拖拽编辑提示
    verification:
      type: operation
      steps:
        - 以默认锁定状态打开首页和分组页
        - 检查卡片与分组 DOM 属性和 computed cursor
        - 尝试拖动网站、文件夹、分组和常用卡
      expected: no draggable true, cursor is not grab, order and storage remain unchanged
    passes: false

  - id: P0-TREE-001
    priority: P0
    assertion: 二级文件夹中的网站可移动到其他分组并可从编辑器和右键菜单删除
    verification:
      type: command
      run: npm test -- tests/tree.test.mjs
      expected: recursive move and delete cases PASS
    passes: false

  - id: P0-TREE-002
    priority: P0
    assertion: 文件夹不能移动到自身或后代，产品不允许创建第三级文件夹
    verification:
      type: command
      run: npm test -- tests/tree.test.mjs
      expected: cycle and depth guards PASS
    passes: false

  - id: P0-COUNT-001
    priority: P0
    assertion: 分组页显示顶层项数和网站总数，文件夹卡在 grid/detail 两种视图都显示网站与子文件夹数
    verification:
      type: operation
      steps:
        - 打开演示数据的家庭网络分组
        - 切换 grid 与 detail
        - 打开 NAS 文件夹
      expected: counts match recursive tree and remain visible in both views
    passes: false

  - id: P0-HOME-001
    priority: P0
    assertion: 1024×768 下搜索框和至少八个常用网站完整位于首屏，无需纵向滚动
    verification:
      type: browser-measurement
      viewport: 1024x768
      themes: [dark, light]
      expected: search top >= 0, eighth favorite bottom <= 768, horizontal overflow = 0
    passes: false

  - id: P0-HOME-002
    priority: P0
    assertion: 高度小于 820px 使用紧凑首页，时钟不再把常用网站推离首屏
    verification:
      type: combined
      run: npm test -- tests/home-settings.test.mjs
      viewports: [1268x714, 1024x768, 768x800]
      expected: compact state PASS and favorites remain before widgets in DOM and visual order
    passes: false

  - id: P0-HOME-003
    priority: P0
    assertion: 未配置 URL 的硬件监控组件不会显示失败卡，默认 seed 不包含硬件监控组件
    verification:
      type: command
      run: npm test -- tests/home-settings.test.mjs
      expected: unconfigured hardware visibility and seed cases PASS
    passes: false

  - id: P0-HOME-004
    priority: P0
    assertion: 组件可在设置中启用、停用和排序，刷新后顺序保持
    verification:
      type: operation
      steps:
        - 在组件设置中关闭天气并把今日移动到时钟前
        - 保存并刷新新标签页
      expected: weather hidden and remaining order persists
    passes: false

  - id: P1-ONBOARD-001
    priority: P1
    assertion: 首次安装提供导入浏览器书签、演示模板、空白开始三个互斥入口，关闭不会静默选择
    verification:
      type: command
      run: npm test -- tests/onboarding.test.mjs
      expected: three choices and deferred close cases PASS
    passes: false

  - id: P1-ONBOARD-002
    priority: P1
    assertion: 演示模板有清晰标识和一键替换/清空入口，第一次实际编辑后标识消失
    verification:
      type: operation
      steps:
        - 选择演示模板
        - 确认首页演示标识可见
        - 新增一个网站
      expected: marker is visible before edit and absent after edit
    passes: false

  - id: P1-WEATHER-001
    priority: P1
    assertion: 未同意天气定位时不请求 IP 地理服务，同意前明确展示数据来源
    verification:
      type: combined
      run: npm test -- tests/onboarding.test.mjs
      operation: 清空同意状态并观察首次首页 network log
      expected: no ipwho/geojs/open-meteo request before consent
    passes: false

  - id: P1-PERM-001
    priority: P1
    assertion: 书签和身份能力在用户启用对应功能时请求，拒绝后核心导航仍可用
    verification:
      type: operation
      steps:
        - 在新 profile 加载扩展并拒绝书签权限
        - 打开新标签页、搜索、编辑本地分组
        - 再从设置主动启用书签同步
      expected: core features work after denial and permission can be requested again from explicit action
    passes: false

  - id: P1-SEARCH-001
    priority: P1
    assertion: 全局搜索支持中文、全拼、拼音首字母、URL、备注、标签、别名和拉丁字符容错匹配
    verification:
      type: command
      run: npm test -- tests/search-index.test.mjs
      expected: all search dimensions PASS
    passes: false

  - id: P1-SEARCH-002
    priority: P1
    assertion: 配置变化后搜索索引更新，删除项不会残留在结果中
    verification:
      type: command
      run: npm test -- tests/search-index.test.mjs
      expected: incremental rebuild and deletion cases PASS
    passes: false

  - id: P1-LIBRARY-001
    priority: P1
    assertion: 书签库支持结果多选、全选当前结果、批量移动和批量删除，批量删除写墓碑并创建快照
    verification:
      type: command
      run: npm test -- tests/library-manager.test.mjs
      expected: selection, move, delete, tombstone and snapshot hooks PASS
    passes: false

  - id: P1-LIBRARY-002
    priority: P1
    assertion: 重复检测区分精确、可能和不同，不自动合并可能重复或业务查询不同的网址
    verification:
      type: command
      run: npm test -- tests/url.test.mjs tests/library-manager.test.mjs
      expected: duplicate classification and clustering PASS
    passes: false

  - id: P1-LIBRARY-003
    priority: P1
    assertion: 书签库可筛选失效链接、分组、文件夹和标签，并显示当前结果数
    verification:
      type: operation
      steps:
        - 打开书签库
        - 依次应用失效、分组、文件夹和标签筛选
      expected: each filter changes result set and count consistently
    passes: false

  - id: P1-POPUP-001
    priority: P1
    assertion: popup 可选择顶层分组、一级文件夹和二级文件夹，保存后项目出现在精确目标目录
    verification:
      type: command
      run: npm test -- tests/popup-model.test.mjs
      expected: nested destination save cases PASS
    passes: false

  - id: P1-POPUP-002
    priority: P1
    assertion: popup 记住上次位置并显示最多三个有效最近位置
    verification:
      type: command
      run: npm test -- tests/popup-model.test.mjs
      expected: recent destination retention and pruning PASS
    passes: false

  - id: P1-POPUP-003
    priority: P1
    assertion: popup 在保存前提示精确重复和可能重复，仍允许用户明确保留重复项
    verification:
      type: command
      run: npm test -- tests/popup-model.test.mjs
      expected: exact, possible and forced-save cases PASS
    passes: false

  - id: P1-A11Y-001
    priority: P1
    assertion: 所有可见表单标签与输入控件程序化关联，所有图标按钮有可访问名称
    verification:
      type: command
      run: npm test -- tests/a11y-static.test.mjs
      expected: labels and icon button rules PASS
    passes: false

  - id: P1-A11Y-002
    priority: P1
    assertion: 所有 dialog 有名称、焦点锁定、Escape 关闭和触发点焦点恢复
    verification:
      type: operation
      steps:
        - 用键盘分别打开设置、编辑器、导入预览和书签库
        - 连续按 Tab 与 Shift+Tab
        - 按 Escape
      expected: focus never leaves open dialog and returns to its trigger after close
    passes: false

  - id: P1-A11Y-003
    priority: P1
    assertion: 自定义菜单支持 ArrowUp、ArrowDown、Home、End、Enter、Space 和 Escape
    verification:
      type: operation
      steps:
        - 用键盘打开卡片操作菜单
        - 逐一执行所有规定按键
      expected: roving focus and activation follow ARIA menu keyboard behavior
    passes: false

  - id: P1-A11Y-004
    priority: P1
    assertion: Toast、同步、权限、导入和复制结果通过 live region 宣告
    verification:
      type: command
      run: npm test -- tests/a11y-static.test.mjs
      expected: live region and announce call coverage PASS
    passes: false

  - id: P1-A11Y-005
    priority: P1
    assertion: 深浅主题正文、表单和交互文字达到 WCAG 2.1 AA，点击目标不小于 32×32px
    verification:
      type: browser-audit
      surfaces: [home, group, folder, settings, library, workspace, popup]
      expected: zero contrast failures for normal text and zero interactive targets below 32x32 excluding inline text links
    passes: false

  - id: P2-DIAG-001
    priority: P2
    assertion: 设置诊断显示 schema、revision、配置大小、最后保存、最后云备份、冲突、权限、Agent 和最近错误
    verification:
      type: operation
      steps:
        - 触发一次成功本机保存和一次模拟云失败
        - 打开高级与诊断
      expected: all named fields are visible with timestamps or explicit unavailable state
    passes: false

  - id: P2-DIAG-002
    priority: P2
    assertion: 复制诊断信息不包含密码、token、URL userinfo 或完整网站清单
    verification:
      type: command
      run: npm test -- tests/diagnostics.test.mjs
      expected: redaction cases PASS
    passes: false

  - id: P2-SETTINGS-001
    priority: P2
    assertion: 设置分为常用、数据与同步、外观、组件、高级与诊断，720px 高度下标题和主操作保持可见
    verification:
      type: browser-measurement
      viewport: 1024x720
      expected: header and primary action intersect viewport while content region scrolls independently
    passes: false

  - id: P2-OFFLINE-001
    priority: P2
    assertion: 核心 Lucide 和分组图标随扩展打包，运行时代码没有 @latest 或 @main 远程依赖
    verification:
      type: command
      run: npm test -- tests/offline-static.test.mjs
      expected: local core icon and pinned dependency rules PASS
    passes: false

  - id: P2-OFFLINE-002
    priority: P2
    assertion: 断网时首页、分组、文件夹、设置、编辑和 popup 可用，品牌图标失败时有本地 fallback
    verification:
      type: operation
      steps:
        - 断开网络并重新加载已解压扩展
        - 遍历首页、分组、文件夹、设置、编辑和 popup
      expected: core actions work, every item has a recognizable icon fallback, console error count is 0
    passes: false

  - id: P2-PERM-001
    priority: P2
    assertion: manifest 不包含未使用的 hitokoto 权限，README 权限与网络表覆盖 manifest 和源码中的全部远程请求
    verification:
      type: command
      run: npm run verify:static
      expected: manifest and network disclosure rules PASS
    passes: false

  - id: P2-WORKSPACE-001
    priority: P2
    assertion: 工作区支持创建、重命名、排序、归档、恢复和删除
    verification:
      type: command
      run: npm test -- tests/workspaces.test.mjs
      expected: complete workspace lifecycle PASS
    passes: false

  - id: P2-WORKSPACE-002
    priority: P2
    assertion: 删除工作区默认只解除分组归属，只有显式选择时才删除分组并写墓碑
    verification:
      type: command
      run: npm test -- tests/workspaces.test.mjs
      expected: detach and delete-groups strategies PASS
    passes: false

  - id: P2-WORKSPACE-003
    priority: P2
    assertion: 侧栏和命令面板都有可发现的工作区管理入口
    verification:
      type: operation
      steps:
        - 检查侧栏工作区标题区
        - 打开命令面板并搜索管理工作区
      expected: both paths open the same workspace manager
    passes: false

  - id: P2-RESP-001
    priority: P2
    assertion: 宽度不大于 760px 时侧栏为可关闭抽屉，不在页面顶部占据内容高度
    verification:
      type: combined
      run: npm test -- tests/responsive-static.test.mjs
      viewport: 390x844
      expected: static rules PASS and closed drawer contributes zero document flow height
    passes: false

  - id: P2-RESP-002
    priority: P2
    assertion: 390、768、1024、1268、1440 五档宽度均无横向溢出，主要操作可达
    verification:
      type: browser-matrix
      viewports: [390x844, 768x800, 1024x768, 1268x714, 1440x900]
      surfaces: [home, group, folder, settings, palette, library, workspace, popup]
      expected: document scrollWidth <= innerWidth on every newtab surface; popup has no clipped primary action
    passes: false

  - id: P2-RESP-003
    priority: P2
    assertion: 少量卡片的分组和文件夹使用受控内容宽度，文件夹计数在 grid 视图始终可见
    verification:
      type: operation
      steps:
        - 打开只有三个顶层项的家庭网络分组
        - 在 grid 和 detail 之间切换
      expected: grid does not stretch cards across full desktop width and folder count remains visible
    passes: false

  - id: P2-VISUAL-001
    priority: P2
    assertion: 背景图模式的小字号元信息在深浅主题均可读，新增动效尊重 prefers-reduced-motion
    verification:
      type: combined
      run: npm test -- tests/responsive-static.test.mjs
      operation: 在两套主题与 reduced motion 下检查首页、设置和抽屉
      expected: static rule PASS, AA contrast PASS, nonessential transition duration is 0 under reduced motion
    passes: false

  - id: E2E-001
    priority: E2E
    assertion: 新安装到跨上下文保存的完整链路可用
    verification:
      type: end-to-end
      steps:
        - 使用全新浏览器 profile 加载已解压扩展
        - 选择导入浏览器书签并授权
        - 用 popup 把当前网页保存到二级文件夹
        - 打开新标签页并确认网站出现在该文件夹
        - 在 popup 或 background 更新同一 config 后重新检查
      expected: item remains once, path is correct, badge and newtab agree, console error count is 0
    passes: false

  - id: E2E-002
    priority: E2E
    assertion: 并发删除与编辑跨保存、重载和远端合并后保持正确
    verification:
      type: end-to-end
      steps:
        - 上下文 A 删除二级文件夹网站
        - 上下文 B 编辑另一个网站并保存
        - 触发 storage remote change 和云合并
        - 重载两个上下文
      expected: deleted item absent, edited item updated, no duplicate IDs, no conflict is hidden
    passes: false

  - id: E2E-003
    priority: E2E
    assertion: Provider 切换链路只在明确提交时打开一次目标
    verification:
      type: end-to-end
      steps:
        - 在首页输入唯一文本
        - 依次切换两个 Provider
        - 检查未打开新页且文本不变
        - 按 Enter 一次
      expected: exactly one destination opens with selected provider and original text
    passes: false

  - id: E2E-004
    priority: E2E
    assertion: 1024×768 首屏、设置与弹窗共同满足关键任务可达性
    verification:
      type: end-to-end
      steps:
        - 在 1024×768 深色主题打开首页并打开第八个常用网站
        - 切换浅色主题并重复
        - 打开设置修改 Provider
        - 用 popup 保存到二级目录
      expected: no page scroll required before favorite activation, no clipped primary action, all state persists
    passes: false

  - id: E2E-005
    priority: E2E
    assertion: 凭据从设置输入到导出、云上传、诊断复制的全链路均不泄漏
    verification:
      type: end-to-end
      steps:
        - 输入唯一 WebDAV user、password 和 Agent token
        - 触发本机保存、sync 保存、云上传、备份导出和复制诊断
        - 搜索所有可观察载荷和输出
      expected: secrets only exist in local secret storage and authorized request header; all other outputs have zero matches
    passes: false
```
