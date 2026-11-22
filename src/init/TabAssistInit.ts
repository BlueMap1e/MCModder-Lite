import { Init } from "./Init";

/**
 * 合成表添加/编辑页（/item/tab/）辅助。
 *
 * 背景：用户填表姿势 = 右手鼠标在记忆栏/搜索结果点选物品落槽，左手键盘录入
 * 数量。原生流程落槽后焦点留在候选格，左手必须先找到滚动线下方的数量框才能
 * 开录。本辅助在落槽发生后把焦点送到对应数量框（.slot-text-N）；聚焦同时触发
 * 站点原生 mouseenter/focus 配对高亮（.active）。开关 tabFillFocusQty（默认开）。
 *
 * 另含配对高亮拆绑（unswitched）：站点按 slot-text-N 类名 + data-type 成对打
 * .active，产出槽的数量/概率字段捆绑同亮（2026-11-22 用户反馈反直觉）——来源
 * 为字段时只保留来源字段与格子，来源为格子时保留整组。
 *
 * 沙箱纪律：选中槽位不读页面全局 strTableSlotFocus（TM Firefox 的 Xray 包装
 * 下页面 var 不可见，harness 无沙箱测不出——2026-11-22 真机报告「聚焦毫无
 * 效果」），改由监听槽位 click 自行维护镜像；候选 click 用原生捕获（对站点
 * handler 的绑定顺序 / stopPropagation 免疫），一律 setTimeout(0) 读终态。
 */
export class TabAssistInit extends Init {
  /** 自维护选中槽位镜像；空值回落 = 帧内首个 in 槽（与站点预置语义一致） */
  private selectedSlotId = "";
  private bound = false;

  canRun() {
    return /\/\/www\.mcmod\.cn\/item\/tab\/(add|edit)\//.test(this.parent.href);
  }

  run() {
    if (this.bound) return;
    this.bound = true;
    this.bindPairingRefine();
    // 「未落盘 = 默认开」语义：TM 沙箱下新键读不到默认值时别用 !x 误关
    if (this.configs.getSettings("tabFillFocusQty") === false) return;
    this.bindFillFocus();
  }

  /** 配对高亮拆绑：来源字段只保留来源+格子；来源格子保留整组 */
  private bindPairingRefine() {
    $(document)
      .off("mouseenter.tabPairRefine focusin.tabPairRefine")
      .on(
        "mouseenter.tabPairRefine focusin.tabPairRefine",
        ".slot-text, .item-table-gui-slot",
        (ev) => {
          // 让出事件轮次：站点配对 handler（同事件委托）先跑完，.active 为终态
          window.setTimeout(() => this.refinePairing(ev.target as HTMLElement | null), 0);
        },
      );
  }

  private refinePairing(source: HTMLElement | null) {
    // 来源是格子：数量+概率同属该槽，整组同亮不拆
    if (!source?.matches?.(".slot-text")) return;
    const id = source.getAttribute("data-id");
    const type = source.getAttribute("data-type");
    if (!id || !type) return;
    document.querySelectorAll(".slot-text.active").forEach((peer) => {
      if (
        peer !== source &&
        peer.getAttribute("data-id") === id &&
        peer.getAttribute("data-type") === type
      ) {
        peer.classList.remove("active");
      }
    });
  }

  /** 落槽后聚焦：候选格原生捕获 click → 轮次后读选中槽镜像 → 聚焦对应数量框 */
  private bindFillFocus() {
    // 选中槽位镜像双通道：jQuery 委托吃键盘流的合成 .click()（jQuery trigger
    // 不派发原生事件），原生捕获吃真点击且免疫站点 handler 的 stopPropagation
    $(document).on("click.tabAssistSlot", ".item-table-gui-slot", (ev) => {
      this.selectedSlotId = (ev.target as HTMLElement).closest(".item-table-gui-slot")?.id ?? "";
    });
    document.addEventListener(
      "click",
      (ev) => {
        const slot = (ev.target as HTMLElement | null)?.closest?.(".item-table-gui-slot");
        if (slot) this.selectedSlotId = slot.id;
      },
      true,
    );
    // GUI 切换 = 服务器整块重渲染，旧槽位 id 作废（新帧由回落逻辑取首格）
    $(document).on("changed.bs.select.tabAssistGui", "#item-table-gui-select", () => {
      this.selectedSlotId = "";
    });
    document.addEventListener(
      "click",
      (ev) => {
        const t = ev.target as HTMLElement | null;
        if (!t?.closest?.("#item-table-item-frame .item-table-hover, #item-table-custom-button"))
          return;
        window.setTimeout(() => this.focusQtyOfSelectedSlot(), 0);
      },
      true,
    );
  }

  /** 把焦点送到当前选中槽位对应的数量输入框 */
  private focusQtyOfSelectedSlot() {
    const slotId =
      this.selectedSlotId && document.getElementById(this.selectedSlotId)
        ? this.selectedSlotId
        : (document.querySelector("#item-table-gui-frame .item-table-gui-slot[data-type='in']")
            ?.id ?? "");
    const m = /^item-table-gui-slot-(in|out)-(\d+)$/.exec(slotId);
    if (!m) return;
    const slotValue = document.getElementById(slotId)?.querySelector("input.value");
    // 落槽未发生（候选点击未写入任何物品/标签）时不抢焦点
    if (!(slotValue instanceof HTMLInputElement) || !slotValue.value) return;
    const qty = document.querySelector(
      `#item-table-gui-frame input.slot-text[data-multi-id="${m[1] === "in" ? "slot-in-number" : "slot-out-number"}"][data-part="${m[2]}"]`,
    );
    if (!(qty instanceof HTMLInputElement)) return;
    // preventScroll：数量区通常在折叠线下，裸 focus 会把页面猛跳过去（2026-11-22
    // 真机反馈「页面会跳」）。焦点照落（.active 配对照常触发），首键输入时浏览器
    // 才自然滚到该框——数量吃默认 1 不输入的场景页面零滚动
    qty.focus({ preventScroll: true });
  }
}
