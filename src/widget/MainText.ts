import type { ConfigRepository } from "../config/ConfigRepository";
import type { Mcmodder } from "../Mcmodder";
import { Utils } from "../Utils";
import type { WebFetchUtils } from "../WebFetchUtils";
import { Values } from "../Values";

type LinkMarkReplaceRule = {
  regExp: RegExp;
  icon: string;
  parser: (link: string) => string;
};

export class MainText {
  private readonly configs: ConfigRepository;
  private readonly web: WebFetchUtils;
  private readonly container: JQuery;

  constructor(parent: Mcmodder, container: Node | JQuery) {
    this.configs = parent.configRepository;
    this.web = parent.web;
    this.container = $(container);

    if (this.configs.getSettings("linkCheck")) {
      this.linkCheck();
    }

    // 图像本地化检测
    if (this.configs.getSettings("imageLocalizedCheck")) {
      this.imageLocalizedCheck();
    }
  }

  /**
   * 资料链接检查：疑似冲突（同文本 → 不同目标）与 Fandom 旧链接就地打
   * mcmodder-link-warn 标记——纯被动通道，不弹 Toast（2026-11-22 用户裁定移除，
   * 上游 Toast 频道病第二例）。标记打在链接本体上，不依赖「资料链接标注」开关
   * （旧实现把 warn 类打在标注 span 上，标注关闭时冲突完全隐形——858246 实证）。
   *
   * 领域注记（同文本多目标 ≠ 编辑错误，标记仅为「请核对」提示而非错误断言）：
   * AE 系方块/面板形态变体共用一个本地化名（858246 实证：655633 块状 ae2:interface
   * 与 655790 面板状 ae2:cable_interface，副条目与主条目文本按惯例同步），GT 系
   * 则是重名物品跨模组实现——两个语境里同文本多目标都是编辑者的显式指定。
   */
  private linkCheck() {
    const linkMap: Map<string, string> = new Map();
    const warnList: string[] = [];
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
        const isClash = warnList.includes(a.textContent);
        const isFandom = (a as HTMLAnchorElement).href.includes("minecraft.fandom.com");
        if (isClash || isFandom) {
          a.classList.add("mcmodder-link-warn");
          // 标注 span（若开启）同步点亮，保持旧行为的完整形态
          a.nextElementSibling?.classList.add("mcmodder-link-warn");
        }
      });
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
