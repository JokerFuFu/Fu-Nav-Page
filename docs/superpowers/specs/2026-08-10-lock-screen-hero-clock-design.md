# 锁屏式首页时钟设计

日期：2026-08-10

状态：用户已确认方案 A，按“完全自主执行”约束实施。

配套计划：`docs/superpowers/plans/2026-08-10-lock-screen-hero-clock-plan.md`

验收合约：`docs/superpowers/evals/2026-08-10-lock-screen-hero-clock-eval.md`

## 设计判断

这是 Fu Nav 现有首页的定向演进，不重做信息架构。面向个人高频新标签页使用，采用克制的 iPhone 锁屏式大字时钟语言。

- `DESIGN_VARIANCE: 5`
- `MOTION_INTENSITY: 3`
- `VISUAL_DENSITY: 3`
- 继续使用项目原生 ES Modules、现有 token 与本地字体，不引入第三方 UI 或字体依赖。

## 问题

当前时钟被存储在 `settings.widgets`，渲染成与天气、今日同级的卡片。这导致它可以被拖拽、删除、按工作区隐藏，也只能使用固定的小字号和固定白色壁纸样式，不符合首页主视觉与用户对锁屏时钟的预期。

## 目标行为

1. 时钟不再是组件。首页非隐私模式中，时钟是搜索框上方的固定英雄元素，DOM 顺序为“日期、时间、问候、搜索、常用、组件”。
2. 时钟不受工作区 `hiddenWidgets`、组件排序或组件管理器影响；切换普通工作区时持续显示。
3. 旧配置里的所有 `type: "clock"` 组件在启动迁移中删除，`showClock` 与新的 `heroClock` 个性化配置保留并持久化。迁移幂等，不补回时钟组件。
4. 默认时间字号为 `clamp(72px, 9vw, 108px)`；短视口使用不低于 72px 的紧凑英雄规格，移动端保持单列且不产生横向溢出。
5. 自动颜色分析当前背景图在时钟实际覆盖区域的亮度，并把现有黑色遮罩叠加后的结果纳入对比度计算；选择浅色或深色文字，使大字时间至少达到 3:1。无法采样时回退到当前主题文字色。
6. 用户可以手动覆盖字体、大小、字重、表现形式、时间格式、信息量和颜色。手动颜色优先于自动分析。

## 个性化模型

`settings.heroClock` 使用固定枚举，非法或缺失值回退默认：

```js
{
  font: 'system',       // system | rounded | serif | mono
  size: 'standard',     // compact | standard | large
  weight: 'regular',    // light | regular | bold
  style: 'shadow',      // solid | shadow | outline
  format: '24',         // 24 | 12
  details: 'full',      // time | date | full
  colorMode: 'auto',    // auto | light | dark | custom
  customColor: '#f5f7ff'
}
```

- `system` 使用现有 Inter/PingFang 字体栈。
- `rounded`、`serif`、`mono` 只使用系统可用的 `ui-rounded`、`ui-serif`、`ui-monospace` 回退，不下载字体。
- `solid` 不加装饰；`shadow` 根据文字色使用反向柔和阴影；`outline` 用细描边并保留最低限度阴影。
- `details=time` 只显示时间；`details=date` 显示日期与时间；`details=full` 再显示问候。

## 自动取色

新增独立模块负责两个边界：纯数据设置归一化/迁移，以及背景亮度到颜色方案的判定。

背景图使用 `cover + center`，取样器按图片尺寸与当前视口计算真实裁切区域，再采样首页内容区上方中央区域。采样失败、没有背景图或图片解码失败时不抛错，删除自动色数据属性并回退 `var(--text)`。

自动方案只在 `colorMode=auto` 生效。浅色、深色、自定义三种手动模式直接写时钟自己的 CSS 变量，不修改页面主题或背景遮罩。

## 编辑入口

- 设置页“外观”区保留“显示锁屏时钟”开关，并增加“自定义时钟”按钮。
- 时钟本体提供右键菜单“自定义时钟”，打开同一个编辑器。
- 编辑器包含即时预览、枚举分段控件和原生颜色输入；保存后立即持久化并重绘。
- 时钟不出现在“管理首页组件”、新增卡片菜单或工作区组件显隐列表中。

## 响应式与可访问性

- `<time>` 元素带机器可读 `datetime`，但不使用会每分钟打断读屏的 live region。
- 颜色输入有可访问名称，所有布尔项走现有 `core.toggle()`，其他设置使用现有 `seg()` 和 `field()`。
- 1024×768 仍需完整看到时钟、搜索框和至少八个常用网站；390×844 不得横向溢出。
- 不增加自动循环动画；只保留颜色/阴影的 130ms 状态过渡，并由现有 reduced-motion 守卫覆盖。

## 非目标

- 不增加模拟指针时钟、秒钟动画、世界时钟、天气联动或远程字体市场。
- 不改变收藏内容、`favOrder`、工作区、搜索引擎、背景图片和其他组件顺序。
- 不使用 `mix-blend-mode` 作为主要可读性方案，因为复杂动漫壁纸上结果不可预测。

## 验收

- 纯函数单测覆盖迁移、枚举归一化、时间格式、详情显隐和自动对比色。
- 静态测试保证时钟不再通过 `buildWidgetCards` 创建，也不进入组件管理。
- 真实扩展 E2E 从旧 `widgets:[clock]` 配置启动，验证迁移后组件数组无 clock、英雄时钟位于搜索框前、明暗背景自动切色、手动样式持久化、工作区切换不隐藏时钟。
- 全量单元、静态与真实扩展 E2E 全绿后才完成。
