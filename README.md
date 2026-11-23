# MCModder-Lite

[![Build](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)

面向 MC 百科（[mcmod.cn](https://www.mcmod.cn)）日常编审的用户脚本：夜间模式、界面 QoL、编辑器与审核效率增强。

基于 [Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)（AGPL-3.0）分叉并独立维护。想用功能更全、更好玩的版本，请用上游。

## 定位

- **为长期日用而做**：以稳定、安全、兼容为先，不追求功能数量。
- **QoL 开箱即用，附加功能可关**：常用增强默认开启，但每一项都能在设置里关掉；少数侵入性功能默认关闭。
- **本地优先**：无账号体系、无云端同步、不收集数据。设置与个人数据只存在脚本管理器（Tampermonkey 等）的本地存储。
- **不是上游的加强版**：删掉的功能通常不会重新添加。上游修复按需审计移植，不合并上游分支。

## 安装

1. 安装用户脚本管理器：
   - Chrome：[Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox：[Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)（[Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) 也可）
2. 打开[一键安装链接](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)，在安装页点「安装」。
   - 点了没反应：去 [Releases](https://github.com/BlueMap1e/MCModder-Lite/releases/latest) 手动下载 `mcmodder-lite.user.js`，拖进脚本管理器。
3. 打开任意百科页面即生效。设置入口：**个人中心 → 设置 → 脚本设置**。

> 更新走脚本头部的 `@updateURL`（GitHub Releases）。更新后若界面没变，刷新页面；脚本管理器里若提示「保存未生效」，确认没有编辑器脏缓冲覆盖。
>
> **不要和上游 Mcmodder 同时启用**：两者 namespace 不同、互不感知，同时启用会重复注入、互相覆盖样式。

## 主要能力

**阅读与外观**

- 夜间模式三态开关（跟随系统 / 固定日间 / 固定夜间），主站与社群各自适配。
- 夜间图片调暗滑条（主站、社群分层），覆盖资料正文、首页区块、榜单、帖子图、工具页与 MOD 特性站；图标与界面控件不受影响。
- 主题样式包、界面皮肤、自定义配色、圆角/透明度/字体、背景图池（本地轮换）。
- 资料悬浮预览、表格自动折叠与特性修复、宽窄屏切换、贡献榜/矿词页重排版（默认关）。

**编辑**

- Markdown / HTML 编辑器、行内代码与引用转换、自动缩进、编辑量统计。
- 表格墙修复、自动链接接管（可回退）、改动说明候选。
- 差异页文本对比器（逐字/词/行，可收起）、版本差异的表格行高亮。
- 一键复制资料名、模组关系记录、最近浏览。

**审核与后台**（需编辑员权限）

- 待审项分屏、列表按时间段自动展开、自定义 UID 筛选、实时刷新待审列表。
- 审核窗内的正文对比与时间线。

**效率与安全**

- 每日自动签到、日志智能管理（可选 CurseForge / Modrinth / GitHub 来源）、AdSense 屏蔽。
- 外部内容按纯文本/白名单渲染，链接只放行 http(s)；所有代码随脚本打包，无运行时远程加载。
- 仅申请运行所需的 GM 权限；网络请求只发生在百科页面请求与可选的日志来源（CurseForge / Modrinth / GitHub），没有遥测上报。

完整功能与默认值以设置面板为准；版本变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 与上游的差异

**移除**：云端表态与 Supabase、GIF 编辑器、结构编辑器、ECharts 数据看板、成就系统、GTCEu、请求队列、JSON 导入 UI、娱乐彩蛋、多账号切换。这些模块不会回归，除非有明确需求并单独讨论。

**保留并继续维护**：自动链接面板、短评跨页/楼层跳转、待审列表自动展开、自动签到、编辑器增强、夜间模式。

**本仓库新增**：主题样式包与三态夜间、图片调暗分层、本地背景图池、差异页对比器收起、Markdown/HTML 编辑管线、日志来源管理、AdSense 屏蔽等。

**上游策略**：上游只读。定期对账 `upstream/dev` 增量，逐条判断「已跟 / 未跟 / 不适用 / 不采纳」，只移植有实际收益且可验证的修复；不合并分支、不回灌上游。

## 方向

- **维护优先级**：实际可用性 > 安全 > 兼容 > 新功能。没有真实使用场景的需求不预埋，问题攒批处理。
- **功能取舍**：QoL 默认开、可关；改变布局或侵入性强的默认关；移除的模块不因上游有而回归。
- **上游关系**：只读审计、按需移植；版本线可随上游基线同步（如 2.4.3），但不合并分支、不跟随上游发版节奏。
- **明确不做**：账号体系、云端同步、遥测上报、运行时远程加载、需要额外后端的功能。
- **版本节奏**：随真实使用中的问题攒批发布，不按固定排期；变更以 [CHANGELOG.md](./CHANGELOG.md) 为准。

## 设置与数据

- 设置面板按页面/工作流分域，节默认折叠；支持搜索。
- **改默认值只影响从未改过该项的用户**：持久化设置优先。需要强制迁移时，版本里会带一次性迁移逻辑。
- 社群相关设置（夜间模式、图片调暗）在社群页面**刷新后**生效。
- 数据保存在脚本管理器的 GM 存储（`mcmodderSettings` 等键）；清除站点数据不会清掉它们，换浏览器/换管理器需要自行迁移。

## 兼容与已知限制

- 现代 Firefox / Chrome 内核（含 Zen）。主站、找服玩、MOD 特性站、个人中心；社群为独立适配层。
- 后台相关能力需要编辑员权限；无权限时页面不可达，相关功能看不到是正常的。
- 「上传文件按钮」依赖站点未文档化的 UEditor 接口，默认关闭，站点改动后可能失效。
- 社群修改头像页（登录态 TTFB 极慢 + Flash 上传器）站点侧已报废，脚本不介入。
- 移动端只做基础兼容：分屏、部分布局增强会自动关闭。

## 常见问题

**更新后界面没变？** 先刷新页面；再确认脚本管理器里保存的是新版本。若提示「保存了却没生效」，检查是否有编辑器脏缓冲覆盖（Revert File 后再更新）。

**和上游 Mcmodder 能一起用吗？** 不建议。两者 namespace 不同、互不感知，同时启用会重复注入并互相覆盖；只保留一个。

**改了设置为什么没效果？** 社群相关设置在刷新后生效；此外，改过某项设置后，新版本的默认值不会覆盖你的选择（持久化设置优先）。

**后台/审核功能为什么看不到？** 那些能力需要编辑员权限，页面本身不可达时功能不会出现。

**为什么删了上游的某个功能？** 见「与上游的差异」。移除模块默认不回归；确有需求请提 issue 单独讨论。

## 开发

技术栈：TypeScript + Vue 3 + Vite（`vite-plugin-monkey` 打包为单文件用户脚本）。

```bash
npm install
npm run dev        # 开发服务器，装进脚本管理器即可热更新
npm run build      # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify     # lint + 格式 + 循环依赖检查（静态门禁）
npm run check      # verify + 构建 + 公共页 smoke + 安全 smoke（约 2 分钟）
npm run test:logic # 纯决策逻辑测试（tsx，无需站点）
npm run pack       # 构建 + 打包发行 zip
```

- 可发布产物是 `dist/mcmodder-lite.user.js`。
- 架构、代码约定与改动落点见 [AGENTS.md](./AGENTS.md)；测试与真机取证工具不在仓库内（登录态 harness 属本地环境）。
- 提交 PR 请保持改动可解释、按主题拆分；涉及布局/样式的改动请附前后截图或真机说明。

## 反馈

遇到 Bug 或有建议，欢迎提 [issue](https://github.com/BlueMap1e/MCModder-Lite/issues)。请附上：

- 脚本版本（设置面板或脚本管理器里可见）、浏览器与版本；
- 页面 URL、复现步骤、期望与实际；
- 控制台报错（如果有）。

个人维护项目，欢迎 issue 与 PR。

## 许可

[AGPL-3.0](./LICENSE)。上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者，本分叉的修改归本仓库贡献者，同样以 AGPL-3.0 授权；分发时须保留版权与许可声明，并提供对应源码。
