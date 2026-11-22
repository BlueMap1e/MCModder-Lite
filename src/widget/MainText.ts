import type { ConfigRepository } from "../config/ConfigRepository";
import type { Mcmodder } from "../Mcmodder";
import { Utils } from "../Utils";
import type { WebFetchUtils } from "../WebFetchUtils";
import { Values } from "../Values";

export class MainText {
  private readonly configs: ConfigRepository;
  private readonly web: WebFetchUtils;
  private readonly container: JQuery;

  constructor(parent: Mcmodder, container: Node | JQuery) {
    this.configs = parent.configRepository;
    this.web = parent.web;
    this.container = $(container);

    if (this.configs.getSettings("linkCheck")) {
      this.fandomLinkCheck();
    }

    // 图像本地化检测
    if (this.configs.getSettings("imageLocalizedCheck")) {
      this.imageLocalizedCheck();
    }
  }

  /**
   * Fandom 旧链接检测：命中 minecraft.fandom.com 的链接就地加红框
   * （mcmodder-link-warn）。面向红石生电等仍有 fandom 残留引用的条目，
   * 服务 zh.minecraft.wiki 迁移巡检；纯被动标记，无 Toast。
   *
   * 原「资料链接检查」的同文本→不同目标查重已于 2026-11-22 摘除（用户裁定）：
   * 该判据源自 GT 系语境——同名物品跨模组实现，查重对那里有用；但 AE/Mek 系
   * 的同名是同模组内的形态变体（858246 实证：655633 方块 ae2:interface 与
   * 655790 面板 ae2:cable_interface），编辑落链时目标即唯一指定，查重对这类
   * 页面是常态化误报。GT 系编辑如需查重可使用上游 Mcmodder。上游 MainText
   * 仍有旧实现，对账时勿回迁。
   */
  private fandomLinkCheck() {
    this.container
      .find('> *:not(.item-data) a[href*="minecraft.fandom.com"]')
      .each((_, a) => a.classList.add("mcmodder-link-warn"));
  }

  private imageLocalizedCheck() {
    this.container.find(".figure img").each((_, e) => {
      const img = e as HTMLImageElement;
      if (img.complete) {
        this.singleImageLocalizedCheck(img);
      } else {
        img.onload = () => this.singleImageLocalizedCheck(img);
      }
    });
  }

  private singleImageLocalizedCheck(img: HTMLImageElement) {
    const src = img.dataset.src ?? img.src;
    this.web
      .createRequest({ url: src, method: "HEAD" }, "图像本地化检测：探测图片体积与类型")
      .then((resp) => {
        const container = $(img).parent();
        if (resp.status != 200) return;
        // GM_xmlhttpRequest 的 responseHeaders 是 "key: value" 换行串（不是 fetch 的
        // Headers 对象），解析成小写键的对象再取值
        const headers = Object.fromEntries(
          resp.responseHeaders
            .split(/\r?\n/)
            .map((line) => {
              const colon = line.indexOf(":");
              return colon < 0
                ? ["", ""]
                : [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()];
            })
            .filter(([key]) => key),
        );
        const size = Number(headers["content-length"]);
        const contentType = headers["content-type"] ?? "?";
        const isLocalized = src.includes("mcmod.cn");
        if (isLocalized) return;
        if (size > Values.ueditorFileMaxSize)
          container // editor.options.fileMaxSize
            .append(
              `<span class="badge badge-warning mcmodder-localize-check">该图片尚未本地化，但是体积 (${Utils.getFormattedSize(size)}) 超过了本地图床最大体积限制</span>`,
            )
            .css("border", "10px solid var(--mcmodder-color-warning)");
        else if (!["image/png", "image/jpg", "image/jpeg", "image/gif"].includes(contentType))
          container // editor.options.fileAllowFiles ?
            .append(
              `<span class="badge badge-warning mcmodder-localize-check">该图片尚未本地化，但是使用了本地图床不支持的文件格式 (${Utils.escapeHTML(contentType)})</span>`,
            )
            .css("border", "10px solid var(--mcmodder-color-warning)");
        else
          container
            .append(
              '<span class="badge badge-danger mcmodder-localize-check">该图片尚未本地化！</span>',
            )
            .css("border", "10px solid var(--mcmodder-color-danger)");
      })
      .catch(() => {
        // 外链图床探测失败（未列入 @connect 的域被篡改猴拦截、网络原因等）：
        // 探测是尽力而为，createRequest 内部已有 console.warn 与去抖提示，这里不重复打扰
      });
  }
}
