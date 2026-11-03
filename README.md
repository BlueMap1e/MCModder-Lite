# MCModder-Lite

[MCmodder](https://github.com/Charcoal-Black/Mcmodder) 的个人精简分支，仅供自用。

基于 Mcmodder 2.4.1（AGPL-3.0）。原项目版权归 [Charcoal-Black](https://github.com/Charcoal-Black) 及其贡献者所有；本分支的修改同样以 AGPL-3.0 发布。

## 与上游的差异

### 保留的功能

- 深色 UI / 夜间模式（含 UEditor 弹窗、评分雷达图、封面调暗）
- 编辑器增强：Markdown 编辑器、源代码编辑器、编辑量统计、智能链接（Alt + C）、实用工具、上传附件按钮
- 表格墙修复：正文以表格结尾时自动补尾随行，空单元格方向键可逃逸
- 正文字节统计、编辑器尺寸自适应
- 短评：跨页楼层跳转、解除折叠、展开高度
- 自动签到（每日首次访问）
- 个人资料 / 设置中心、多账号切换
- 表格编辑器（合成表 / GUI 编辑）、可编辑表格引擎
- 自动链接本地搜索（`itemRepository` 选择脚本存储或 IndexedDB）

### 已移除的功能

- 自定义表态系统（含 Supabase 云端）
- GIF 浏览与编辑器
- JSON 管理面板、结构编辑器
- ECharts 图表、成就系统、贡献榜图表
- GTCEu 集成
- 请求队列、预编辑（预提交）、自动订阅、自动检查更新/待审
- 跨标签页弹窗广播、网络请求提示
- 娱乐彩蛋（今日黄历、标语追踪 / 3D 标语、Live2D、愚人节、猎奇仙人）
- 快捷串门、强制 v4、经验计算器、字数活跃图表、多差异对比列表
- 支持版本压缩（站点已原生支持）

### 附带修复（相对上游 2.4.1）

- 正文以表格结尾时无法在表格后换行的问题（三形态归一化 + 空单元格按键逃逸）
- UEditor 弹窗（插入图片/链接等）的夜间模式适配
- Markdown / HTML 编辑器首次启用时内容无法灌入的时序回归
- 长正文 + 未开 HTML 编辑器时统计逻辑持续抛错
- `?mrid` 日志页自动转换会清空正文

## 构建

```bash
npm install
npm run build    # 产物：dist/mcmodder-lite.user.js，复制进篡改猴即可
npm run verify   # lint + 配置 lint + 格式检查
```

## 说明

- 这是**硬分叉**：不合并上游分支，上游修复按需 cherry-pick。
- 设置界面只保留真实存在的功能；如果发现“点了没反应”的开关，属于 bug。
- `CHANGELOG.md` 由维护者手工维护，发版时从对应小节生成 release notes。
