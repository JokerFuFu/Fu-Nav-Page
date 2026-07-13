# 参与贡献 Fu 导航

欢迎!Fu 导航是一个 MV3 浏览器扩展,**纯 ES modules、无构建步骤**,上手很快。这份指南讲清楚怎么跑起来、改动要过哪些线、以及提 PR 前该自查什么。

## 快速开始

```bash
git clone https://github.com/JokerFuFu/Fu-Nav-Page.git
cd Fu-Nav-Page
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/newtab.html
```

预览服务器下,数据自动走 `localStorage` + `data/seed.json`(演示数据),不需要打桩任何 chrome API。改完 JS/CSS **刷新即生效**(无构建)。

> ⚠️ 换了 JS/CSS 后,无头预览可能有模块缓存 —— 硬刷新(或重启浏览器)再看效果。

## 两种测试环境,别只用一种

| 改动类型 | 用哪个环境测 |
|---|---|
| 布局 / 样式 / 组件 / 命令面板 / 表单 …… 大部分 UI | `http.server` 预览即可 |
| **书签双向同步、跨域授权、本机伴随服务、图标角标** | **必须真实扩展环境**:`chrome://extensions` → 开发者模式 → 加载已解压。这些依赖 `chrome.*` API,预览服务器测不出来 |

## 改 UI 前:先读 [DESIGN.md](DESIGN.md)

`DESIGN.md` 是**视觉的唯一事实源** —— 颜色/间距/圆角/字体都是 token,组件有既定规则。改或加任何界面元素:

- 先在 DESIGN.md 找对应 token/组件,**没有就先补 DESIGN.md 再写代码**,不要凭感觉现造数值。
- 图标一律用 **Lucide**(`mico('lucide名')` / `core.btn(label,cls,on,ic)`),**不用 emoji 或文字符号(✕ ▾ ＋ …)当图标**。
- 布尔设置项走 `core.toggle()`,表单控件用项目自定义样式,不用浏览器原生外观。
- 触控目标 ≥ 32px;模态/弹层挂在 `body` 下(`buildModalHost`),不在 `.lay-fusion` 里。
- 改动别只覆盖首页 —— 分组页 / 文件夹页 / 设置弹层 / 各编辑表单 / 右键菜单 / 命令面板 都要过一遍同类写法。

> 项目根的 `CLAUDE.md` 是给 AI 编码助手的详细行为准则,里面的视觉铁律同样适用于人类贡献者,值得一读。

## 提交规范

- commit message 用 `feat: / fix: / docs: / chore:` 前缀,**一类改动一笔提交**;中英文皆可。
- **本项目没有自动化测试**,所以请在 PR 里说明你**怎么验证的**(截图 / 复现步骤 / 在哪个环境测的)。
- CI 只做 JS 语法校验和关键 JSON 校验,**不做行为测试** —— 过 CI ≠ 功能对,真正的把关靠你的自测 + 维护者 review。

## PR 流程

1. Fork → 从 `main` 切一个分支。
2. 改动 + 自测(按上表选对环境)。
3. 提 PR,按模板勾选自查项、附上验证说明。UI 改动请附截图(深/浅色都截更好)。
4. 等 review。任何人的 PR 都要维护者点 Merge 才进 `main`,尽管放心提。

## 关于 `docs/superpowers/` 和 eval 三件套

仓库里的 `docs/superpowers/`(spec / plan / eval)是维护者与 AI 协作的开发流,**贡献者不需要照着写**,正常提 PR 即可。

有想法但不确定要不要做?**先开 Issue 聊**,别闷头写完一大堆再提 —— 省得方向不合白做。
