import { Init } from "./Init";

export class ModlistInit extends Init {
  canRun() {
    return this.parent.href.includes("/modlist.html");
  }
  run() {
    // 筛选按钮垂直居中：纯外观微调，作用面仅 /modlist.html，
    // 刻意不设开关（deliberately unswitched）。
    $(".modlist-filter-block button").css({
      "background-color": "transparent",
      top: "50%",
      transform: "translateY(-50%)",
    });
  }
}
