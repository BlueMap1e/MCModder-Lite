import type { ConfigRepository } from "../config/ConfigRepository";
import { Mcmodder } from "../Mcmodder";
import { Utils } from "../Utils";
import { Values } from "../Values";

type LinkMarkReplaceRule = {
  regExp: RegExp;
  icon: string;
  parser: (link: string) => string;
};

export class MainText {
  private readonly configs: ConfigRepository;
  private readonly utils: Utils;
  private readonly container: JQuery;

  constructor(parent: Mcmodder, container: Node | JQuery) {
    this.configs = parent.configRepository;
    this.utils = parent.utils;
    this.container = $(container);

    if (this.configs.getSettings("linkCheck")) {
      this.linkCheck();
    }

    // 图像本地化检测
    if (this.configs.getSettings("imageLocalizedCheck")) {
      this.imageLocalizedCheck();
    }
  }

  private linkCheck() {
    const linkMap: Map<string, string> = new Map();
    const warnList: string[] = [];
    let clashFlag = false;
    let fandomFlag = false;
    this.container
      .find('> *:not(.item-data) a:not([href="javascript:void(0);"])')
      .filter((_, c) => !!(c.textContent && (c.parentNode as Element)?.tagName != "LEGEND"))
      .each((_, a) => {
        const key = a.textContent;
        const value = (a as HTMLAnchorElement).href.replaceAll(/https:\/\/www1?\.mcmod\.cn/g, "");
        if (this.configs.getSettings("linkMark")) {
          this.generateLinkMark(value).insertAfter(a);
        }
        if (!linkMap.has(key)) linkMap.set(key, value);
        else if (linkMap.get(key) != value) warnList.push(key);
      })
      .each((_, a) => {
        if (warnList.includes(a.textContent)) {
          a.nextElementSibling?.classList.add("mcmodder-link-warn");
          clashFlag = true;
        } else if ((a as HTMLAnchorElement).href.includes("minecraft.fandom.com")) {
          a.nextElementSibling?.classList.add("mcmodder-link-warn");
          fandomFlag = true;
        }
      });
    if (clashFlag) Utils.commonMsg("发现疑似的链接冲突问题，请检查~", false);
    if (fandomFlag)
      Utils.commonMsg(
        "发现 Minecraft Wiki Fandom 链接，请将其及时更新至 zh.minecraft.wiki ~",
        false,
      );
  }

  private static readonly linkMarkReplaceRules: LinkMarkReplaceRule[] = [
    {
      regExp: /^\/item\/\d+\.html$/,
      icon: "cube",
      parser: (link) => Utils.abstractIDFromURL(link, "item").toString(),
    },
    {
      regExp: /^\/item\/tab\/\d+\.html$/,
      icon: "table",
      parser: (link) => Utils.abstractIDFromURL(link, "item/tab").toString(),
    },
    {
      regExp: /^\/class\/\d+\.html$/,
      icon: "cubes",
      parser: (link) => Utils.abstractIDFromURL(link, "class").toString(),
    },
    {
      regExp: /^\/modpack\/\d+\.html$/,
      icon: "file-zip-o",
      parser: (link) => Utils.abstractIDFromURL(link, "modpack").toString(),
    },
    {
      regExp: /^\/author\/\d+\.html$/,
      icon: "author",
      parser: (link) => Utils.abstractIDFromURL(link, "author").toString(),
    },
    {
      regExp: /^\/oredict\/[0-9A-Za-z:_/]+-1.html$/,
      icon: "tag",
      parser: (link) => link.slice(9, -7),
    },
  ];

  private generateLinkMark(link: string) {
    const container = $('<span class="mcmodder-link-check">');
    for (const { regExp, icon, parser } of MainText.linkMarkReplaceRules) {
      if (regExp.test(link)) {
        const escaped = Utils.escapeHTML(parser(link));
        container.html(`<i class="mcmodder-link-icon fa fa-${icon}"></i>${escaped}`);
        return container;
      }
    }
    const escaped = Utils.escapeHTML(link);
    return container.html(escaped);
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
    this.utils
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
              `<span class="badge badge-warning mcmodder-localize-check">该图片尚未本地化，但是使用了本地图床不支持的文件格式 (${contentType})</span>`,
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
