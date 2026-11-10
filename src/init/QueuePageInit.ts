import { Utils } from "../Utils";
import { Init } from "./Init";

export class QueuePageInit extends Init {
  canRun() {
    return this.parent.href.includes("/queue.html");
  }
  run() {
    // 审核队列页的行高亮与首列底色：纯外观微调，作用面仅 /queue.html，
    // 刻意不设开关（deliberately unswitched）。
    $(".table td:first-child").css("background", "var(--mcmodder-color-background-transparent)");

    const t = $(".verify-queue-list-table tr")
      .filter((_, content) => $("a[rel=nofollow]", content).text() === this.parent.currentUsername)
      .first();
    Utils.highlight(t, "gold", 2e3, true);
  }
}
