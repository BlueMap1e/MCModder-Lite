# MCModder-Lite

MC 百科（[mcmod.cn](https://www.mcmod.cn)）的轻量编审辅助脚本，基于 [Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)（AGPL-3.0）分叉并独立维护。

[![Build](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)

这不是上游的替代品，只是另一种取舍：保留编辑、审核与夜间阅读中真正高频的功能，去掉云端服务与娱乐模块，压缩体积与依赖，并顺手修复一些编辑器层的顽固问题。如果你需要功能更全的版本，请使用并**支持上游 [Mcmodder](https://github.com/Charcoal-Black/Mcmodder)**——本项目的存在完全建立在上游的工作之上。

## 安装

1. 安装用户脚本管理器：
   - Chrome / Edge：[篡改猴 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox / Zen：[篡改猴 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)（[Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) 亦可）
2. 打开[一键安装链接](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)，在弹出的安装页点「安装」；
3. 打开任意百科页面即生效。设置入口在个人中心 →「设置」。

脚本内置自动更新地址，发新版后篡改猴会自动提示升级，已有设置与数据会保留。主测环境为 Firefox / Zen，Chrome / Edge 同源可用；Safari 与移动端未测试。

## 它做了什么

- **精简**：移除云端表态、GIF 编辑器、结构编辑器、ECharts 图表、成就系统等低频模块；不连接任何第三方云端服务，设置项全部真实生效，用户脚本体积比上游小约三分之一。
- **修复**：表格墙（正文以表格结尾无法换行）、长正文统计卡顿、编辑器首次启用时序回归、`?mrid` 清空正文，以及夜间模式的系列适配（UEditor 弹窗、图表、贡献榜、内容面分层）。
- **体验**：自动链接面板（同模组置顶、快捷键选择）、短评跨页跳转与楼层跳转、用户黑名单、待审列表按时间段自动展开、每日自动签到、双色主题与取色器等。

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)，功能清单见 [AGENTS.md](./AGENTS.md)。

## 反馈与贡献

遇到 Bug 或有建议，欢迎[提 issue](https://github.com/BlueMap1e/MCModder-Lite/issues)，最好附上脚本版本、浏览器与复现步骤；篡改猴菜单里的「输出调试信息」在排查问题时很有用（发送前请脱敏）。

作者的前端水平十分有限（基本靠 AI 结对编程），代码难免粗糙，所以格外欢迎贡献——无论是修 Bug、改文档还是加功能，issue 与 PR 都欢迎。开发很简单：

```bash
npm install
npm run dev      # 开发服务器：装进篡改猴即可热更新
npm run build    # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify   # lint + 格式检查（与 CI 相同的门禁）
```

代码结构与约定见 [AGENTS.md](./AGENTS.md)。

## 许可

[AGPL-3.0](./LICENSE)。上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有，本分叉的修改归本仓库贡献者所有，同样以 AGPL-3.0 授权；分发时须保留版权与许可声明，并提供对应源码。
