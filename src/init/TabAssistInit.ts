import { Init } from "./Init";

/**
 * 合成表添加/编辑页（/item/tab/）辅助。
 *
 * 背景：用户填表姿势 = 右手鼠标在记忆栏/搜索结果点选物品落槽，左手键盘录入
 * 数量。原生流程落槽后焦点留在候选格，左手必须先找到滚动线下方的数量框才能
 * 开录。本辅助在落槽发生后把焦点送到对应数量框（.slot-text-N）；聚焦同时触发
 * 站点原生 mouseenter/focus 配对高亮（.active），与 base.css 的夜间可见化规则
 * 协同。开关 tabFillFocusQty（默认开）。
 */
export class TabAssistInit extends Init {
  canRun() {
    return /\/\/www\.mcmod\.cn\/item\/tab\/(add|edit)\//.test(this.parent.href);
  }

  run() {
    if (!this.configs.getSettings("tabFillFocusQty")) return;
    // 同命名空间 off+on = 幂等重入（run 可能被多次调用）
    $(document)
      .off("click.tabFillFocus")
      .on(
        "click.tabFillFocus",
        "#item-table-item-frame .item-table-hover, #item-table-custom-button",
        () => {
          // 让出当前事件轮次：站点落槽 handler 同样挂在 document 委托链上，
          // 绑定顺序无法保证；轮次结束后 strTableSlotFocus 与槽位 value 必为终态
          window.setTimeout(() => this.focusQtyOfFocusedSlot(), 0);
        },
      );
  }

  /** 把焦点送到当前选中槽位（strTableSlotFocus）对应的数量输入框 */
  private focusQtyOfFocusedSlot() {
    const m = /^item-table-gui-slot-(in|out)-(\d+)$/.exec(window.strTableSlotFocus);
    if (!m) return;
    const slotValue = document.getElementById(m[0])?.querySelector("input.value");
    // 落槽未发生（点击候选但未写入任何物品/标签）时不抢焦点
    if (!(slotValue instanceof HTMLInputElement) || !slotValue.value) return;
    const qty = document.querySelector(
      `#item-table-gui-frame input.slot-text[data-multi-id="${m[1] === "in" ? "slot-in-number" : "slot-out-number"}"][data-part="${m[2]}"]`,
    );
    if (!(qty instanceof HTMLInputElement)) return;
    qty.focus();
  }
}
