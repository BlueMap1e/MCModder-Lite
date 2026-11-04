# MCModder-Lite

MC 百科（[mcmod.cn](https://www.mcmod.cn)）的轻量编审辅助脚本，基于 [Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)（AGPL-3.0）分叉并独立维护。

[![Build](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)

面向每天在百科改资料、审条目的人：保留编辑、审核与夜间阅读中真正高频的功能，去掉云端服务与娱乐模块，并持续修一些编辑器层的顽固问题。需要功能更全的版本，欢迎使用并支持上游 [Mcmodder](https://github.com/Charcoal-Black/Mcmodder)——这个项目是在上游的基础上做减法和长期维护。

## 安装

1. 安装用户脚本管理器：
   - Chrome / Edge：[篡改猴 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox / Zen：[篡改猴 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)（[Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) 亦可）
2. 打开[一键安装链接](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)，在弹出的安装页点「安装」；
3. 打开任意百科页面即生效。设置入口在个人中心 →「设置」。

脚本内置自动更新地址，发新版后篡改猴会自动提示升级，已有设置与数据会保留。主测环境为 Firefox / Zen，Chrome / Edge 同源可用；Safari 与移动端未测试。

## 它做了什么

- **精简**：移除云端表态、GIF 编辑器、结构编辑器、ECharts 图表、成就系统等低频模块；用户脚本约 2.4 MB，比上游小约五分之一；没有账号体系与云端同步，设置项都能真实生效。
- **修复**：表格墙（正文以表格结尾无法换行）、长正文统计卡顿、编辑器首次启用时序回归、`?mrid` 清空正文，以及夜间模式的系列适配（UEditor 弹窗、图表、贡献榜、内容面分层）。
- **体验**：自动链接面板（同模组置顶、快捷键选择）、短评跨页跳转与楼层跳转、用户黑名单、待审列表按时间段自动展开、每日自动签到、双色主题与取色器等。
- **安全与稳定**：外部文本按纯文本处理，链接只放行 http(s)；请求失败会明确提示，不再一直转圈；登录凭据不落盘；请求日志只记地址与用途，不记内容。
- **性能**：长页面首屏少做无用样式计算；自定义字体与 CDN 依赖不再阻塞渲染；悬浮预览不再先闪一下再撑开；请求排期不再反复改写整份设置。

项目没有账号体系。少数功能会访问对应服务：「日志智能管理」请求 CurseForge / Modrinth 的公开接口，「自定义字体」从 Google Fonts 加载字体文件；其余请求只发往 mcmod.cn。

## 方向

- **维护模式**：稳定、安全、兼容优先，不追求功能数量。
- CSS 只做小范围修补，不做大扫除；包体暂不拆分——收益主要在小屏 / 低端设备，代价是加载与调试复杂度。
- 上游修复按需移植，不合并上游分支。

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)，架构与代码约定见 [AGENTS.md](./AGENTS.md)。

## 反馈与贡献

遇到 Bug 或有建议，欢迎[提 issue](https://github.com/BlueMap1e/MCModder-Lite/issues)，最好附上脚本版本、浏览器与复现步骤；篡改猴菜单里的「输出调试信息」在排查问题时很有用（发送前请脱敏）。

项目由个人维护，欢迎 issue 与 PR。提交前请跑一遍与 CI 相同的门禁：

```bash
npm install
npm run dev      # 开发服务器：装进篡改猴即可热更新
npm run build    # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify   # lint + 格式检查（与 CI 相同的门禁）
```

## 许可

[AGPL-3.0](./LICENSE)。上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有，本分叉的修改归本仓库贡献者所有，同样以 AGPL-3.0 授权；分发时须保留版权与许可声明，并提供对应源码。
