# MCModder-Lite

[MCmodder](https://github.com/Charcoal-Black/Mcmodder) 的个人精简分支，仅供自用。

基于 Mcmodder 2.4.1（AGPL-3.0）。原项目版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有；本分支的修改同样以 AGPL-3.0 发布。

## 与上游的差异

### 保留的功能

- 深色 UI / 夜间模式
- 编辑器快速链接（Alt + C，自动链接面板）
- 编辑器快速改动说明（改动附言/说明的建议输入）
- 编辑器增强：Markdown 编辑器、源代码编辑器、编辑量统计、实用工具
- 正文字节统计、编辑器尺寸自适应

### 移除的功能（计划中，逐步进行）

- 自定义表态系统（含 Supabase 云端）
- GIF 浏览与编辑器
- JSON 管理与可编辑表格
- ECharts 图表、成就系统、结构编辑器
- GTCEu 集成
- 自动签到 / 自动订阅 / 预编辑轮询等定时任务
- 愚人节彩蛋、Splash3D 等

### 附带修复（相对上游 2.4.1）

- UEditor 弹窗（多图上传等）的夜间模式适配
- Markdown / HTML 编辑器首次启用时内容无法灌入的时序回归
- 正文以表格结尾时无法在表格后换行的问题

## 构建

```bash
npm install
npm run build   # 产物：dist/mcmodder.user.js，复制进篡改猴即可
```
