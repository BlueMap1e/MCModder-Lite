# MCModder-Lite

MC 百科（[mcmod.cn](https://www.mcmod.cn)）轻量UI优化与编审辅助脚本，基于 [Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)（AGPL-3.0）分叉并独立维护。

[![Build](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)

重点优化夜间模式与开箱即用体验，剔除部分功能，追求轻量化与精简。

需要功能更全、更好玩的版本，请用上游 [Mcmodder](https://github.com/Charcoal-Black/Mcmodder)。

## 安装

1. 安装用户脚本管理器：
   - Chrome：[篡改猴 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox：[篡改猴 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)（[Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) 亦可）
2. 打开[一键安装链接](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)，在安装页点「安装」。
   - 点了没反应时，去 [Release 页面](https://github.com/BlueMap1e/MCModder-Lite/releases/latest) 手动下载 `mcmodder-lite.user.js`，拖进篡改猴。
3. 打开任意百科页面即生效。设置入口在个人中心 →「设置」。

如果与上游 Mcmodder 同时安装，尽量**不要同时打开**。 两者很可能会制造冲突。

出于轻量化，网络安全与常见的使用习惯考虑，MCModder-Lite移除了多账号功能。

内置自动更新，发版后篡改猴会提示升级，设置与数据保留。

**lite.9 一次性迁移**：自 2.4.1-lite.9 起脚本标识（namespace）已更换，从 lite.8 及更早版本升级时，需先**删除旧脚本条目（含上游 Mcmodder，如有）再重新安装**，设置需重新调整一次；此后恢复自动更新与设置保留。

主测 Firefox ，Chrome / Edge 同源可用；Safari 与移动端未测。

## 修改详情

按个人使用习惯调整了上游功能，并进行持续Bug修复。

**移除**：云端表态、GIF 编辑器、结构编辑器、ECharts 图表、成就系统。无账号体系与云端同步。

**保留**：自动链接面板（同模组置顶、键盘选）、短评跨页与楼层跳转、待审列表按时间段自动展开、每日自动签到、日间 / 夜间 / 跟随系统三态开关、主题样式包（整套配色一键切换）。

**修复**：表格墙（正文以表格结尾无法换行）、长正文统计卡顿、Markdown与HTML编辑器启用时序、`?mrid` 清空正文。多处夜间模式适配与完善。

**默认开启、可在设置里关闭**：屏蔽 AdSense 广告、界面皮肤（旧版无条件注入的外观层）、差异页文本对比器、改动说明输入候选、日志搬运来源预设。沙盒页移除侧栏默认关闭，保持站点原生布局。

**安全**：外部内容一律按纯文本渲染，链接只放行 http(s)；请求失败直接报错，不再一直转圈。

请求只发往 mcmod.cn 与下列公开接口：「日志智能管理」访问 CurseForge（含 `api.cfwidget.com` 查项目 ID）、Modrinth、GitHub 的公开 API；「自定义字体」从 Google Fonts 加载字体文件。除此之外不向第三方发送请求，也不做数据上报。

## 方向

- **维护模式**：稳定、安全、兼容优先，不追求功能数量。
- 上游修复按需移植，不合并上游分支。

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)，架构与代码约定见 [AGENTS.md](./AGENTS.md)。

## 反馈与贡献

遇到 Bug 或有建议，欢迎[提 issue](https://github.com/BlueMap1e/MCModder-Lite/issues)，最好附上脚本版本、浏览器与复现步骤。

个人维护，水平有限，欢迎 issue 与 PR。提交前请跑与 CI 相同的检查：

```bash
npm install
npm run dev      # 开发服务器，装进篡改猴即可热更新
npm run build    # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify   # lint + 格式检查
npm run check    # verify + 构建 + 公共页与安全回归测试
```

## 许可

[AGPL-3.0](./LICENSE)。上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有，本分叉的修改归本仓库贡献者所有，同样以 AGPL-3.0 授权；分发时须保留版权与许可声明，并提供对应源码。
