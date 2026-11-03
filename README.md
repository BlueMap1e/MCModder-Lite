# MCModder-Lite

MC 百科（[mcmod.cn](https://www.mcmod.cn)）的轻量编审辅助脚本。基于 [Mcmodder](https://github.com/Charcoal-Black/Mcmodder) 2.4.1 分叉，自 2026-11 起独立维护：只保留编辑与审核真正高频的功能，去掉云端服务与娱乐模块，并修复几个长期困扰正文编辑的问题。

[![Build](https://github.com/BlueMap1e/Mcmodder-Lite/actions/workflows/build.yaml/badge.svg)](https://github.com/BlueMap1e/Mcmodder-Lite/actions/workflows/build.yaml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![Install](https://img.shields.io/badge/install-latest-brightgreen.svg)](https://github.com/BlueMap1e/Mcmodder-Lite/releases/latest/download/mcmodder-lite.user.js)

- 适用站点：`www.mcmod.cn`、`center.mcmod.cn`、后台审核页、`bbs.mcmod.cn`（仅夜间模式）
- 当前版本：**2.4.1-lite.3**。已转入维护模式：功能冻结，只修 bug、按需移植上游修复
- 安装：装好篡改猴 → 打开上面的 install 徽章（或 Releases 里的 `mcmodder-lite.user.js`）→ 在安装页点「安装」

## 这是什么

日常编辑百科时，真正高频的其实只有几件事：改正文、查资料、贴链接、修表格、看审核列表，以及在晚上不刺眼地做这些事。Mcmodder-Lite 围绕这些场景做减法：

- 删掉云端表态、GIF 编辑器、结构编辑器、成就、ECharts、GTCEu 等整套模块；
- 用户脚本体积从 2.9 MB 降到 2.3 MB，`@require` 的外部库从 4 个减到 1 个，不再连接任何第三方云端域名；
- 设置界面清掉了 16 个失效设置项（指向已删功能或根本没人读取），留下能真正生效的；
- 修掉表格墙（正文以表格结尾）与长正文统计等编辑器级问题，见下文「相对上游的修复」。

它不打算替代上游，而是另一种取舍：想要功能全家桶请用 Mcmodder；只想安静地编资料、审条目，用这个。

## 与上游的关系

本仓库是 Mcmodder 的**硬分叉**（fork），不是上游的发行渠道，与上游团队无隶属关系。

- 上游版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有；本分叉的修改同样以 AGPL-3.0 发布。
- 不合并上游分支；上游的修复按需 cherry-pick，冲突按本仓库现有实现手动适配。
- 功能面冻结：只修 bug，不再主动删功能，也不保证与上游功能对齐。

|                 | MCModder-Lite                      | Mcmodder                      |
| --------------- | ---------------------------------- | ----------------------------- |
| 定位            | 轻量、稳定、只做编审               | 功能全面                      |
| 用户脚本体积    | 2.3 MB                             | 2.9 MB                        |
| 外部 `@require` | 1 个（turndown）                   | 4 个（含 Supabase、three 等） |
| 云端服务        | 无                                 | 自定义表态（Supabase）        |
| 更新策略        | 维护模式：修 bug、按需移植上游修复 | 持续开发新功能                |

体积与依赖数据取自 v2.4.1-lite.3 与上游 v2.4.1 的 release 附件。

### 相对上游 2.4.1 的修复

- 正文以表格结尾时无法在表格后换行：三形态归一化（补尾随行 / 空段落补 `<br>` / 清理 nowrap 污染），并支持用方向键从空单元格逃逸；归一化采用最小改动，不重建段落，保留光标书签。
- 长正文 + 未开 HTML 编辑器时，统计逻辑持续抛错（`requestRefresh` 空指针）：看门狗改为按需重算，空闲时不再周期性序列化全文。
- `?mrid` 日志页的自动「Markdown → HTML」会清空正文：改为内容灌入后再执行。
- Markdown / HTML 编辑器首次启用时正文灌不进去的时序回归。
- UEditor 弹窗（插入图片 / 链接等）的夜间模式适配。

### 相对上游已移除的功能

自定义表态与 Supabase 云端、GIF 浏览与编辑器、JSON 管理面板、结构编辑器、ECharts 图表、成就系统、GTCEu 集成、请求队列与预编辑、自动订阅、自动检查更新 / 待审、跨标签页弹窗广播与网络请求提示、娱乐彩蛋（今日黄历、3D 标语、Live2D、愚人节等）、快捷串门、强制 v4、经验计算器、字数活跃图表、多差异对比列表，以及站点已原生支持的支持版本压缩。

## 功能

### 阅读与外观

- 双色主题，取色器内置「百科经典」绿 / 蓝预设；自定义日间 / 夜间背景、字体、文字渐变开关、背景透明度、文字阴影、圆角比例。
- 夜间模式：主站、社群、UEditor 弹窗、评分雷达图重主题化，封面大图可调暗。
- 资料页：正文表格自动折叠并左对齐、综合父资料的子资料紧凑化、合成表 GUI 折叠、物品链接悬停预览、审核 / 预览页显示正文图片。
- 短评：用户黑名单、空白行折叠、超长短评展开警告（核弹警告）、楼中楼链接跳转、按楼层跨页跳转。
- 模组页：基本信息排版恢复、矿物词典 / 物品标签页按模组重排、贡献榜重排、最近浏览的模组记录。
- 广告位置优化（把广告挪到不影响阅读的位置，但不隐藏、不屏蔽）。
- 按时间范围搜索待审列表 / 历史编辑时自动展开所有页。

### 编辑与校对

- 编辑器宽度适应窗口、高度随正文增长；实时显示有效正文字节数与变动量，超过阈值自动暂停统计以防卡顿。
- Markdown 编辑器：正文一键 Markdown ↔ HTML，标题自动转换为百科兼容的 `[h1=xxx]`；行内代码 / 块引用的标签转换方式可选。
- 源代码编辑器：格式化、自动缩进风格可选。
- 自动链接面板：同名资料高亮、同属当前模组（含前置 / 拓展）的资料置顶、前 9 项 `Alt + 数字` 快捷选择、方向键选择；支持直接添加矿物词典 / 物品标签链接（搜索词加 `#` 前缀）。打开面板的快捷键可自定义。
- 自定义模版内容，一键插入 / 替换正文。
- 图标编辑：任意尺寸静态图上传，自动生成 32 px / 128 px（BUFF / DEBUFF 为 36 / 144）；大小图标互转。
- 校对提示：正文链接冲突与旧 Fandom Wiki 链接高亮（可附带 URL 标注）、未本地化的图片资源高亮。
- 表格：表格墙修复（见上文），另有「表格应用样式」「表格自动折叠」「表格图片左对齐」等工具。
- 日志：编辑日志可直接输入 `yymmdd` 快捷设置日期；日志智能管理会自动比对 CurseForge / Modrinth 的文件列表与百科已收录版本，缺失版本在表格中高亮并给出新增入口。

### 审核与后台

- 待审列表紧凑化、按时间段自动展开、一键催审、按间隔自动刷新。
- 审核页左右分屏；样式管理支持实时预览，并修复特殊 CSS 无法加载的问题。
- 按资料类型做提交前规则检查：CurseForge / Modrinth 链接前缀与冗余参数、必备的项目 ID、空合成表等。
- 快速提交 / 通过 / 退回 / 需要检查，附言框自动聚焦。
- 短评回复 / 表态提醒按间隔自动刷新（「实时通讯」）。

### 通用

- 每日首次访问自动签到。
- 个人主页用户切换面板：临时登出或以其他账号浏览。
- 设置中心（个人中心 →「设置」）按「外观 / 个人中心 / 编辑器 / 社群 / 其他」分组，多标签页间同步生效。
- 数据只存本地：设置与缓存走篡改猴存储，大体积数据可切换为 IndexedDB，不上传任何数据。

## 安装

1. 为浏览器安装 [篡改猴](https://www.tampermonkey.net/)（Tampermonkey）。
2. 打开[最新版安装地址](https://github.com/BlueMap1e/Mcmodder-Lite/releases/latest/download/mcmodder-lite.user.js)，在篡改猴的安装页点「安装」。
3. 打开任意百科页面即可生效；点浏览器工具栏的篡改猴图标 →「打开设置」，或访问个人中心 →「设置」进行配置。

其他说明：

- 主测环境是 Firefox / Zen，Chrome / Edge 同源可用；未在 Safari 与移动端测试。
- 本脚本不内置自动更新地址。发新版后重新打开安装地址覆盖安装即可，设置与数据会保留。
- 也可以自行构建：`npm install && npm run build`，产物为 `dist/mcmodder-lite.user.js`，把内容粘进篡改猴新建脚本即可。

## 数据与隐私

- 设置与缓存只写入篡改猴的本地存储（`GM_*Value`），可选 IndexedDB；没有账号体系，也不会上传任何数据。
- 无遥测、无埋点、无广告 SDK，不连接任何第三方云端服务。
- 只有「日志智能管理」会在你打开编辑日志页时按需请求 CurseForge / Modrinth 的公开接口；其余请求只发往 mcmod.cn。
- 登录凭据不经过脚本，脚本只读取页面自身的登录态。

## 已知限制

- 只在 mcmod.cn 相关页面生效；`i.mcmod.cn`、`api.mcmod.cn` 等子域已排除。
- 自动链接的「本地搜索」需要本地物品 JSON 数据，当前版本没有内置导入界面，暂时只有联机搜索可用。
- 审核 / 后台相关功能需要对应的站内权限，普通账号看不到入口。
- 修改了站点 DOM，百科改版后可能短暂失效；遇到问题欢迎提 issue。

## 反馈

- Bug / 建议：[GitHub Issues](https://github.com/BlueMap1e/Mcmodder-Lite/issues)。请附上脚本版本、浏览器版本、复现步骤与截图。
- 篡改猴菜单里的「输出调试信息」可导出设置、计划任务与日志，反馈封 IP 之类的问题时很有用；发送前请自行脱敏。

## 开发

```bash
npm install
npm run dev      # vite-plugin-monkey 开发服务器，把脚本装进篡改猴即可 HMR
npm run build    # 类型检查 + 构建 -> dist/mcmodder-lite.user.js
npm run verify   # eslint + 配置 lint + 格式检查
```

`npm run build` 是唯一门禁（`vue-tsc` 先跑，类型错误与未使用变量都会失败）。没有测试套件，行为验证靠构建、lint 与浏览器实测。代码结构与约定见 [AGENTS.md](./AGENTS.md)，用户可见的变更记录见 `CHANGELOG.md`。

## 许可与致谢

本项目以 [AGPL-3.0](./LICENSE) 发布。

- 原始项目：[Charcoal-Black/Mcmodder](https://github.com/Charcoal-Black/Mcmodder)，版权归 Charcoal-Black 及其贡献者所有。
- 本分叉的修改版权归 BlueMap1e 及本仓库贡献者所有，同样以 AGPL-3.0 授权。
- 分发本脚本或其修改版时，必须保留版权声明与许可证，并提供对应源码。
