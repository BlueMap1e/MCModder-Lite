import { Utils } from "../Utils";
import { Init } from "./Init";

interface UserRankData {
  value: number;
  rate: number;
}

export class RankInit extends Init {
  canRun() {
    return !!(
      this.parent.href.includes("/rank.html") && this.configs.getSettings("advancedRanklist")
    );
  }

  private work(contentRank: JQuery): UserRankData {
    if (contentRank.find(".empty").length) return { value: 0, rate: 100 };
    const contentList = contentRank.find("ul > li");
    const ranklist = $(`<div class="mcmodder-ranklist-container">`).appendTo(contentRank);
    const maxValue = parseFloat(contentList.first().find("span.score").text());
    let totalValue = 0,
      totalRate = 0,
      r = 0;
    for (const _i in contentList.toArray()) {
      const i = Number(_i);
      const e = contentList.eq(i);
      const href = e.find("a").first().prop("href");
      const uid = Utils.abstractIDFromURL(href, "center.mcmod.cn");
      const li = $(`<li data-uid="${uid}">`).appendTo(ranklist);
      let rank;

      let quantity = e.attr("data-content");
      if (quantity.includes("字节")) {
        quantity = quantity
          .replace("字节", " B")
          .replace("(约", '<span class="muted">(~')
          .replace("个汉字)", "汉字)</span>");
      } else {
        quantity = quantity.replace("次", " 次");
      }

      const rate = parseFloat(e.find("span.score").text());
      totalRate += isNaN(rate) ? 0 : rate;
      const userName = e.find("a.name").text();

      let div = $('<a class="avatar" target="_blank">').attr("href", href).appendTo(li);
      $(`<i>`)
        .appendTo(div)
        .css({
          "background-image": `url("${e.find("img").attr("src")}")`,
        });
      div = $(`<div class="content">`).appendTo(li);
      if (i > 0 && e.attr("data-content") != contentList.eq(i - 1).attr("data-content")) r = i;
      switch (Number(r)) {
        case 0:
          rank = '<i class="fa fa-trophy trophy gold" />';
          break;
        case 1:
          rank = '<i class="fa fa-trophy trophy silver" />';
          break;
        case 2:
          rank = '<i class="fa fa-trophy trophy bronze" />';
          break;
        default:
          rank = `<span class="rank-num mcmodder-common-dark">#${Number(r) + 1}</span>`;
      }
      div.html(`
        <p class="name">
          ${rank}
          <a class="me" href="${href}" target="_blank" data-toggle="tooltip" data-original-title="${userName}">
            ${userName + (userName === this.parent.currentUsername ? " (我)" : "")}
          </a>
          (${isNaN(rate) ? 0 : rate}%) 
        </p>
        <div class="progress">
          <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: ${(rate / maxValue) * 100.0}%;">
            <span class="quantity">${quantity}</span>
          </div>
        </div>`);
      if (userName === this.parent.currentUsername) div.find("a").first().css("color", "red");
      totalValue += parseInt(quantity.split(" B")[0].replace(",", ""));
    }
    $("ul", contentRank).first().remove();
    return { value: totalValue, rate: totalRate };
  }

  run() {
    const ranklists = $(".rank-list-block");
    const total1 = this.work(ranklists.eq(0).addClass("edit-byte"));
    const total2 = this.work(ranklists.eq(1).addClass("edit-num"));
    if (total1.value || total2.value) {
      $("<span>")
        .appendTo(".rank-list-frame")
        .attr("class", "mcmodder-golden-alert")
        .html(
          `全体百科用户在 ${$(".rank-search-area .badge-secondary").first().text()} 累计贡献了` +
            (total2.value
              ? `约 <span class="mcmodder-common-dark">${Math.round((total2.value * 100) / total2.rate).toLocaleString()}</span> 次`
              : "") +
            (total1.value
              ? `共约 <span class="mcmodder-common-dark">${Math.round((total1.value * 100) / total1.rate).toLocaleString()}</span> 字节`
              : "") +
            "的编辑量！",
        );
    }
    $(".popover").remove();

    // setTimeout(commentInit, 1e3);

    ranklists
      .on("pointerover", "li", (e) => {
        const uid = $(e.currentTarget).attr("data-uid");
        const result = ranklists.find(`[data-uid=${uid}]`);
        if (result.length > 1) result.addClass("hover");
      })
      .on("pointerout", "li", () => {
        ranklists.find(".hover").removeClass("hover");
      });
  }
}
