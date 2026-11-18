# MCModder-Lite

MC 百科（[mcmod.cn](https://www.mcmod.cn)）轻量UI优化与编审辅助脚本，基于 [Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)（AGPL-3.0）分叉并独立维护。

[![Build](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/MCModder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)

重点优化夜间模式与开箱即用体验，并追求轻量化与精简。

需要功能更全、更好玩的版本，请用上游 [Mcmodder](https://github.com/Charcoal-Black/Mcmodder)。

---

## 安装

1. 安装用户脚本管理器：
   - Chrome：[篡改猴 Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Firefox：[篡改猴 Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)（[Violentmonkey](https://addons.mozilla.org/firefox/addon/violentmonkey/) 也行）
2. 打开[一键安装链接](https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js)，在安装页点「安装」。
   - 点了没反应时，去 [Release 页面](https://github.com/BlueMap1e/MCModder-Lite/releases/latest) 手动下载 `mcmodder-lite.user.js`，拖进篡改猴。
3. 打开任意百科页面即生效。设置入口在个人中心-设置-脚本设置。

如果与上游 Mcmodder 同时安装，尽量别同时打开。 两者很可能会冲突。

出于轻量化，网络安全与常见的使用习惯考虑，MCModder-Lite移除了多账号等一系列功能。

---

## 修改详情

精简上游功能，并持续进行Bug修复与UI QoL优化。

**移除**：云端表态、GIF 编辑器、结构编辑器、ECharts 图表、成就系统。无账号体系与云端同步。

**保留**：自动链接面板、短评跨页与楼层跳转、待审列表按时间段自动展开、每日自动签到、

**新增**：一键主题样式包，日间 / 夜间 / 跟随系统三态开关，日志管理GitHub支持，AdSense屏蔽。

**修复**：表格墙（正文以表格结尾无法换行）、长正文统计卡顿、Markdown与HTML编辑器启用时序、`?mrid` 清空正文。多处夜间模式适配与完善。

**默认开启、可在设置里关闭**：屏蔽 AdSense 广告、界面皮肤（旧版无条件注入的外观层）、差异页文本对比器、改动说明输入候选。沙盒页移除侧栏默认关闭，保持站点原生布局。「日志智能管理」默认关闭，开启后可选 CurseForge / Modrinth / GitHub 作为日志来源。

**安全**：外部内容以纯文本渲染，链接仅放行 http(s)，请求失败显式报错。

---

## 方向

- **设计理念**：稳定、安全、兼容优先，不追求功能数量。
- 上游修复按需移植，不直接合并上游分支。

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)，架构与代码约定见 [AGENTS.md](./AGENTS.md)。

---

## 反馈与贡献

遇到 Bug 或有建议，欢迎提 [issue](https://github.com/BlueMap1e/MCModder-Lite/issues)，最好附上脚本版本、浏览器与复现步骤等详细信息。

个人维护，水平很糟，基本全靠Vibe Coding。欢迎 issue 与 PR。提交前可以跑与 CI 相同的检查：

```bash
npm install
npm run dev      # 开发服务器，装进篡改猴即可热更新
npm run build    # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify   # lint + 格式检查
npm run check    # verify + 构建 + 公共页与安全回归测试
```

## 许可

开源许可为[AGPL-3.0](./LICENSE)。上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有，本分叉的修改归本仓库贡献者所有，同样以 AGPL-3.0 授权；分发时须保留版权与许可声明，并提供对应源码。
