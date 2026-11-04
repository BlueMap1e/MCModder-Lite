import { Utils } from "../Utils";
import { Init } from "./Init";
import { VerifyPageInit } from "./VerifyPageInit";

export class VerifyHistoryInit extends Init {
  private stopExpand = false;
  canRun() {
    return this.parent.href.includes("/verify.html");
  }
  run() {
    if (this.configs.getSettings("autoExpandPage")) {
      this.stopExpand = false;
      const maxPage = parseInt($(".pagination span").text().split(" / ")[1]?.split(" 页")[0]);
      const param = window.location.href.split("verify.html?")[1]?.split("&page=")[0];
      if (!param || !maxPage || $(".badge-secondary").text().includes("最近100条")) {
        // 带时间范围搜索但结果不足一页：告知用户而非静默跳过（日常访问无搜索参数时不打扰）
        if (param && !maxPage && !$(".badge-secondary").text().includes("最近100条")) {
          Utils.commonMsg("该时间范围内的结果不足一页，无需展开~");
        }
        new VerifyPageInit(this.parent).run();
        return;
      }
      const getHistoryPage = (id: number) => {
        this.parent.utils
          .createRequest(
            {
              url: `${this.parent.hostname}/verify.html?${param}&page=${id}`,
              method: "GET",
              headers: { "Content-Type": "text/html; charset=UTF-8" },
            },
            "展开历史审核记录",
          )
          .then((resp) => {
            if (!resp.responseText) {
              Utils.commonMsg("加载历史审核记录失败...", false);
              return;
            }
            // 不依赖油猴的 responseXML（不同实现/版本对 HTML 响应是否填充行为不一），
            // 统一用 responseText 自行解析，确定性执行
            const d = $(new DOMParser().parseFromString(resp.responseText, "text/html"));
            d.find(".verify-list-list-table tbody")
              .children()
              .appendTo(".verify-list-list-table tbody");
            Utils.commonMsg(`成功加载第 ${id} / ${maxPage} 页~`);
            if (id < maxPage && !this.stopExpand) setTimeout(() => getHistoryPage(++id), 1e3);
            else new VerifyPageInit(this.parent).run();
          });
      };
      Utils.commonMsg("准备自动展开，可随时按 Ctrl + C 取消~");
      $("html").bind("keydown", (e) => {
        // 输入框 / 可编辑区里的 Ctrl+C 是复制，不该被当成「取消自动展开」
        if (Utils.isEditableTarget(e)) return;
        if (Utils.isKeyMatch({ ctrlKey: true, keyCode: 67 }, e)) this.stopExpand = true;
      });
      getHistoryPage(2);
      $(".pagination").remove();
    } else {
      new VerifyPageInit(this.parent).run();
    }
  }
}
