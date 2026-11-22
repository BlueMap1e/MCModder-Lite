import { Init } from "./Init";

/**
 * 合成表添加/编辑页（/item/tab/）紧凑布局（tabCompactLayout，默认关）。
 *
 * 需求（2026-11-22 用户构图裁定）：单屏完成工作——隐藏说明性文字墙，数量框
 * 并入 GUI 右侧死区，记忆栏超行内部滚动。实现纪律（见 PROJECT-HISTORY §一/§四
 * 两轮尸检）：纯 CSS 重排 + 加法打标，不移动/销毁/重建任何节点，表单序列化
 * 契约（data-multi-name / slot-text-N）零接触；CSS 全部挂在 html 的
 * mcmodder-tab-compact marker 下（规则本体在 base.css），GUI 服务器模板整块
 * 替换后样式按选择器自动重新命中，无需重建。
 *
 * 文字墙隐藏策略：p.tips 用内容指纹匹配后打 mcmodder-wall 类（快照实证部分
 * 模板会把「删除选中/清空所有」功能链接渲染进 tips——凡含链接的 tips 一律
 * 不隐藏，宁可留墙不可伤功能）。无类名的 GUI 注意事项 DIV 与页首横幅由
 * marker 作用域 CSS 直接显隐（类名稳定，模板替换后自动重新命中）。
 *
 * 记忆/搜索面板由 AJAX 渲染（POST /frame/edit/table/ItemUsed/），tips 可能
 * 晚于 InitLoader 到场——按 300ms × 20 轮询补打（同 callEditor/pollCompacted
 * 先例），打标幂等。
 */
export class TabCompactInit extends Init {
  /** 已知说明性文字墙指纹；含功能链接的 tips 永不匹配隐藏 */
  private static readonly WALL_TEXT =
    /记忆120个|搜索参与此合成表|如果合成表使用了百科中尚未记录|请选择此合成表所使用的GUI|该合成的摆放要求|如有要求，请在此添加|该合成开始出现|该合成被移除|特别需要注意/;

  /**
   * 左栏「编辑帮助」文字墙（2026-11-22 用户指认「重复阅读的文字」）：欢迎语、
   * 编审部提醒打油诗、快捷键清单、小技巧。锚点护栏天然保住链接行与 QQ 群
   * 按钮（它们都含 <a>）；完成添加/改动附言/验证码等功能件不在此列。
   */
  private static readonly SIDEBAR_WALL =
    /欢迎加入MC百科|编审部提醒|玩法千万条|编辑不规范|Alt \+ [XQWZ]|Ctrl \+ Enter :|小技巧：选中|请填写改动附言/;

  canRun() {
    return /\/\/www\.mcmod\.cn\/item\/tab\/(add|edit)\//.test(this.parent.href);
  }

  run() {
    // 默认关：显式 opt-in（=== true），与默认开门禁的「!== false」语义相反
    if (this.configs.getSettings("tabCompactLayout") !== true) return;
    document.documentElement.classList.add("mcmodder-tab-compact");
    this.tagWalls();
    let round = 0;
    const timer = window.setInterval(() => {
      this.tagWalls();
      if (++round >= 20) window.clearInterval(timer);
    }, 300);
  }

  /** 给已知文字墙打标（纯加法：只加类；幂等；含链接的功能块跳过） */
  private tagWalls() {
    document.querySelectorAll("#edit-form p.tips").forEach((p) => {
      if (p.classList.contains("mcmodder-wall")) return;
      if (p.querySelector("a")) return;
      if (!TabCompactInit.WALL_TEXT.test(p.textContent ?? "")) return;
      p.classList.add("mcmodder-wall");
    });
    document.querySelectorAll(".left .text p").forEach((p) => {
      if (p.classList.contains("mcmodder-wall")) return;
      if (p.querySelector("a")) return;
      if (!TabCompactInit.SIDEBAR_WALL.test(p.textContent ?? "")) return;
      p.classList.add("mcmodder-wall");
    });
  }
}
