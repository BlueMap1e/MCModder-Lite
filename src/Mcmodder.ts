import { GM_openInTab } from "$";
import { ConfigUtils } from "./config/ConfigUtils";
import { MemuCommandLoader } from "./loader/MenuCommandLoader";
import { ScheduleRequestLoader } from "./loader/ScheduleRequestLoader";
import { ScheduleRequestUtils } from "./schedulerequest/ScheduleRequestUtils";
import { StorageBufferLoader } from "./loader/StorageBufferLoader";
import { StyleLoader } from "./loader/StyleLoader";
import { StorageBuffer } from "./StorageBuffer";
import { AdvancedUEditor } from "./ueditor/AdvancedUEditor";
import { UEditor } from "./ueditor/UEditor";
import { Utils, type ThemeColorSet } from "./Utils";
import { Values } from "./Values";
import { Init } from "./init/Init";
import { InitLoader } from "./loader/InitLoader";
import { GeneralEditInit } from "./init/GeneralEditInit";
import { EditorInit } from "./init/EditorInit";
import { Swiper } from "./widget/Swiper";
import { sanitizeHTML } from "./vue/composables/useSanitizedHTML";
import { ConfigRepository } from "./config/ConfigRepository.ts";

interface ScreenAttachedFrameData {
  node: HTMLElement;
  parentPosY: number;
  parentHeight: number;
}

export class Mcmodder {
  utils: Utils;
  configRepository: ConfigRepository;
  currentUID: number;
  currentUsername: string;
  storageBuffer: StorageBuffer;
  initList: Init[] = [];
  readonly isV4: boolean;
  readonly isMac: boolean;
  readonly isMobileClient: boolean;
  href: string;
  ueditorFrame: UEditor[];
  screenAttachedFrame: ScreenAttachedFrameData[];
  cfgutils: ConfigUtils;
  /** 计划任务调度器（自动签到等；装配见构造器，勿删 ScheduleRequestLoader.run 的调用） */
  scheduleRequestUtils: ScheduleRequestUtils;
  styleColors: ThemeColorSet;
  preferredWiderScreen = false;
  isNightMode = false;
  title = "";
  css = "";
  itemTypeList?: ItemCustomTypeList;
  readonly hostname: string;
  private msgAlertCount = 0;
  /** 站点自身的未读消息数（页头铃铛与标签页标题的基底） */
  private msgSiteCount = 0;
  private readonly titleNode = $("title");
  private readonly linkPendingSet = new Set<string>();
  private readonly linkContentDictionary: Record<string, string> = {};
  /** 悬浮预览只绑定一次事件，避免每次 updateItemTooltip 重复注册 */
  private hoverPreviewBound = false;
  /** 当前有效的 hover 令牌；离开或移到别的链接时作废旧定时器 */
  private hoverPreviewToken: symbol = Symbol("hover-preview");
  /** 当前 hover 的链接：用于判断指针是否只是移到了链接内部子元素 */
  private hoverPreviewAnchor?: HTMLAnchorElement;
  private readonly elementColorDictionary: Map<HTMLElement, string> = new Map();
  private readonly elementColorCache: Map<string, string> = new Map();

  constructor() {
    this.isV4 = typeof fuc_topmenu_v4 === "function";
    this.isMac = Utils.isMac();
    this.isMobileClient = Utils.isMobileClient();
    const headerUserName = $(".header-user-name a, .name.top-username a, .profilebox").first();
    this.currentUsername = headerUserName.text() || "";
    this.currentUID =
      Number(headerUserName.attr("href")?.split("//center.mcmod.cn/")[1]?.split("/")[0]) || 0;
    this.ueditorFrame = [];
    this.href = window.location.href;
    MemuCommandLoader.run();
    this.title = this.titleNode.html().replace(" - MC百科|最大的Minecraft中文MOD百科", "");
    this.hostname = Values.hostname;

    this.screenAttachedFrame = [];

    this.storageBuffer = new StorageBuffer(this);
    StorageBufferLoader.run(this.storageBuffer);

    this.utils = new Utils(this);
    this.configRepository = this.utils.configs;

    // 计划任务调度器：注册全部定时任务（自动签到等）并启动每秒轮询。
    // 这行曾在 lite.2 移除预编辑轮询时被连带删除，导致自动签到静默失效——勿再删除。
    this.scheduleRequestUtils = new ScheduleRequestUtils(this);
    ScheduleRequestLoader.run(this.scheduleRequestUtils);

    this.cfgutils = new ConfigUtils(this);

    // 一次性迁移：Alt+C 旧默认值与百科原生「快速排版设置」（Alt+C/Alt+Q）冲突
    //（2026-11-11 实机报告）。新默认 Alt+X = 接管站点原生的自动链接键（编辑器
    // 捕获阶段拦截，见 AdvancedUEditor）——该键在用户实机上被证实可达，无需再赌
    // 新键位。只精确匹配旧默认值（Alt+C 且无其他修饰键），自定义过的组合不动。
    const fastLinkKey = this.configRepository.getSettings("keybindFastLink");
    if (
      fastLinkKey &&
      fastLinkKey.altKey === true &&
      !fastLinkKey.ctrlKey &&
      !fastLinkKey.shiftKey &&
      !fastLinkKey.metaKey &&
      fastLinkKey.keyCode === 67
    ) {
      this.configRepository.setSettings("keybindFastLink", { altKey: true, key: "X", keyCode: 88 });
    }
    this.styleColors = Utils.getThemeColors(this.configRepository);

    InitLoader.run(this, this.initList);

    // 先应用夜间配色再撤防闪烁遮罩：main() 里的 updateNightMode 隔着迁移、配置读取
    // 与大量 DOM 扫描，慢页面上「遮罩已撤、dark 未上」的间隙就是白屏一闪
    // （上游同构问题）。注意顺序：必须先迁移旧键再计算生效值；此处对
    // nightMode 只读不写（写存储由 main() 的 resolveNightMode 负责），
    // 否则未迁移用户的旧 nightMode 会被 auto 解析结果覆盖，迁移语义被破坏。
    this.migrateNightModePreference();
    this.isNightMode = this.computeNightMode();
    document.documentElement.classList.toggle("dark", this.isNightMode);

    StyleLoader.run(this);

    this.main();
  }

  private callEditor(attempt = 0) {
    const useAdvanced = !!$(".edit-tools").length || /\/sandbox\/[0-9]+.html/.test(this.href);
    setTimeout(() => {
      // 站点主编辑器挂在全局 editor 上；部分场景（如 center 留言板）赋值时机
      // 或变量名不同，兜底取 UE.getEditor 登记的最后一个实例
      const editorInstance =
        (typeof editor !== "undefined" && editor) ||
        (window as any).UE?.instances?.[(window as any).UE.instances.length - 1];
      if (!editorInstance) {
        console.warn("[MCModder-Lite] 未找到编辑器实例，跳过增强。");
        return;
      }
      // iframe / document 由 UEditor 异步渲染，慢页面上 300ms 时可能尚未就绪
      // （center 留言板实测：静默跳过后永不重试，夜间化随之失效）——轮询等待
      if (!editorInstance.iframe || !editorInstance.document) {
        if (attempt < 20) this.callEditor(attempt + 1);
        else console.warn("[MCModder-Lite] 编辑器 iframe 就绪超时，跳过增强。", editorInstance);
        return;
      }
      try {
        if (useAdvanced) new AdvancedUEditor(editorInstance, this);
        else new UEditor(editorInstance, this);
      } catch (error) {
        console.error("[MCModder-Lite] 编辑器增强初始化失败：", error);
        if (!this.editorErrorNotified) {
          this.editorErrorNotified = true;
          Utils.commonMsg("编辑器增强加载失败，正文编辑仍可正常使用。", false);
        }
      }
    }, 3e2);
  }

  /** 编辑器增强初始化失败时只提示一次，避免多编辑器/重复触发刷屏 */
  private editorErrorNotified = false;

  private readonly generalEditorObserver = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      // 匹配任意 eduiN_iframeholder：多编辑器 / 多实例场景下编号会递增
      // （如 center 留言板），精确匹配 #edui1 会漏掉后续实例
      if (
        /_iframeholder$/.test((mutation.target as HTMLElement).id) &&
        mutation.addedNodes.length
      ) {
        this.callEditor();
        this.generalEditorObserver.disconnect();
        return;
      }
    }
  });

  updateItemTooltip() {
    // 鼠标悬浮预览介绍
    if (this.configRepository.getSettings("hoverDescription")) {
      $(".common-imglist li, .item-list-type-right span, .relation a").off();
      // 先按 href 子串粗筛：原实现遍历全文档所有 <a>，长页面上是纯浪费
      $('a[href*="/item/"], a[href*="/class/"]')
        .filter((_, e) => {
          const href = (e as HTMLAnchorElement).href;
          return (
            /\/\/www1?\.mcmod\.cn\/item\/[0-9]*\.html/.test(href) ||
            /\/\/www1?\.mcmod\.cn\/class\/[0-9]*\.html/.test(href)
          );
        })
        .filter((_, _c) => {
          const c = $(_c);
          if (c.parents(".mcmodder-item-link").length) return false;
          if (c.parent().hasClass("item-table-hover")) return false;
          return true;
        })
        .addClass("mcmodder-item-link")
        .removeAttr("title");
      $(".modlist-block .title a").removeClass("mcmodder-item-link");
      $(".mcmodder-item-link[data-toggle=tooltip]:not([data-html])").each((_, e) => {
        $(e).tooltip("dispose");
        // 强制序列化终极邪道
        // eslint-disable-next-line no-self-assign
        e.outerHTML = e.outerHTML;
      });
      $(".mcmodder-item-link").each((_, e) => {
        const href = (e as HTMLAnchorElement).href;
        $(e).attr({
          "data-source-url": href.split("mcmod.cn/")[1],
          "data-toggle": "tooltip",
          "data-html": "true",
          "data-original-title": `
            <div class="mcmodder-preview-container" data-source-url="${href.split("mcmod.cn/")[1]}">
              <div class="mcmodder-preview-frame maintext">
                <div class="mcmodder-loading"></div>
              </div>
            </div>
          `,
        });
      });
      if (!this.hoverPreviewBound) {
        this.hoverPreviewBound = true;
        document.addEventListener("pointerout", (e) => {
          const related = e.relatedTarget as Node | null;
          // 指针只是在链接内部子元素之间移动，不算离开
          if (related && this.hoverPreviewAnchor?.contains(related)) return;
          this.hoverPreviewAnchor = undefined;
          this.hoverPreviewToken = Symbol("hover-preview");
        });
        document.addEventListener("pointerover", async (e) => {
          const target = e.target;
          if (!(
            target instanceof HTMLAnchorElement && target.classList.contains("mcmodder-item-link")
          )) {
            return;
          }
          this.hoverPreviewAnchor = target;
          const token = (this.hoverPreviewToken = Symbol("hover-preview"));
          await Utils.sleep(250);
          if (this.hoverPreviewToken !== token) return;
          const sourceUrl = $(target).attr("data-source-url");
          const previewContainer = $(`.mcmodder-preview-container[data-source-url="${sourceUrl}"]`);
          const previewFrame = previewContainer.find(`.mcmodder-preview-frame`);
          const describedby = $(target).attr("aria-describedby");
          if (!describedby) return;
          const tooltip = $("#" + describedby);
          if (!tooltip.length || !tooltip.hasClass("show")) return;
          if (previewFrame.attr("data-status")) return;
          // 请求失败时不要留下永久的加载动画：换成一行提示，下次悬浮再重试
          const showPreviewError = () => {
            previewFrame.html('<span class="mcmodder-common-danger">预览加载失败</span>');
            $(target).attr("data-original-title", previewContainer.prop("outerHTML"));
            previewFrame.removeAttr("data-status");
            this.linkPendingSet.delete(sourceUrl);
          };
          const storagedContent = this.linkContentDictionary[sourceUrl];
          if (storagedContent !== undefined) {
            previewFrame.attr("data-status", "fulfilled");
            $(target).attr("data-original-title", storagedContent);
            previewFrame.children().html(storagedContent);
            return;
          }
          if (this.linkPendingSet.has(sourceUrl)) return;
          previewFrame.attr("data-status", "pending");
          this.linkPendingSet.add(sourceUrl);
          await Utils.sleep(750);
          if (this.hoverPreviewToken !== token) {
            this.linkPendingSet.delete(sourceUrl);
            previewFrame.removeAttr("data-status");
            return;
          }
          let resp;
          try {
            resp = await this.utils.createRequest(
              {
                url: target.href,
                method: "GET",
                anonymous: true,
              },
              "链接预览",
            );
          } catch (error) {
            console.warn("[MCModder-Lite] 链接预览请求失败：", error);
            showPreviewError();
            return;
          }
          if (!resp.responseXML) {
            showPreviewError();
            return;
          }
          if (previewFrame.attr("data-status") === "fulfilled") {
            this.linkPendingSet.delete(sourceUrl);
            return;
          }
          const doc = $(resp.responseXML);
          doc.find(".itemname > .tool").remove();
          doc.find(".quote_text legend a").last().remove();
          // 悬浮预览注入的是**另一个页面**的正文 HTML，属于不可信内容：走全站同一个
          // DOMPurify 白名单（`sanitizeHTML`）再落进 DOM。缓存 `linkContentDictionary`
          // 取自清洗后的容器 outerHTML，复用时不需要再洗一遍。
          previewFrame.html(
            sanitizeHTML(
              doc.find(".item-content, .class-menu-main .text-area.font14").first().html() ?? "",
            ),
          );
          if (previewFrame.text() === "暂无简介，欢迎协助完善。") {
            previewFrame.html('<span class="mcmodder-common-danger">该资料正文暂无介绍...</span>');
          }
          if (sourceUrl.includes("item/")) {
            doc
              .find(".itemname")
              .first()
              .insertBefore(previewFrame.children().first())
              .find("h5")
              .each((_, h5) => {
                const keywords = (doc.find("meta[name=keywords]").attr("content") ?? "").split(",");
                const english = keywords[1];
                const raw = h5.textContent ?? "";
                const suffix = english ? ` (${english})` : "";
                const hasEnglish = !!english && raw.endsWith(suffix);
                const chinese = hasEnglish ? raw.slice(0, -suffix.length) : raw;
                // 资料名来自远端页面，用 DOM 组装，避免被当成 HTML 解析
                h5.textContent = "";
                const chineseAnchor = document.createElement("a");
                chineseAnchor.textContent = chinese;
                h5.appendChild(chineseAnchor);
                if (hasEnglish) {
                  h5.appendChild(document.createTextNode(" "));
                  const enSpan = document.createElement("span");
                  enSpan.className = "item-h5-ename";
                  const enAnchor = document.createElement("a");
                  enAnchor.textContent = english;
                  enSpan.appendChild(enAnchor);
                  h5.appendChild(enSpan);
                }
              });
          } else if (sourceUrl.includes("class/")) {
            // 标题块同样是远端节点，与正文一样先过白名单再插进文档
            const classTitle = doc.find(".class-title").first();
            $(sanitizeHTML(classTitle.prop("outerHTML") ?? "")).insertBefore(
              previewFrame.children().first(),
            );
          }
          // 右侧资料表同理：远端节点直接 insertBefore 会连 `<img onerror>` 一起带进页面
          const rightTableSource = doc.find(".item-data .item-info-table").first();
          const rightTable = $(sanitizeHTML(rightTableSource.prop("outerHTML") ?? ""));
          rightTable.removeClass("righttable").insertBefore(previewFrame);
          const showImg = (c: Element) =>
            (c.outerHTML = c.outerHTML.replaceAll("data-src=", "src="));
          rightTable.find("img").each((_, img) => {
            showImg(img);
          });
          const mcicons = $("#icon-toughness-empty");
          if (!mcicons.length) {
            const module = import.meta.glob("./html/mcicons.html", {
              query: "?raw",
              eager: true,
            });
            const mciconsHtml = (module["./html/mcicons.html"] as any).default as string;
            $(mciconsHtml).prependTo(document.body);
          }
          if (this.configRepository.getSettings("hoverImage")) {
            previewFrame.find("img").each((_, img) => {
              showImg(img);
              $(img).attr("src", $(img).attr("data-src"));
            });
          }
          rightTable.find("tr").last().remove();
          const final = previewContainer.prop("outerHTML");
          $(target).attr("data-original-title", final);
          this.linkContentDictionary[sourceUrl] = final;
          this.linkPendingSet.delete(sourceUrl);
          previewFrame.attr("data-status", "fulfilled");
        });
      }
    }
    Utils.updateAllTooltip();
  }

  notifyUnreadMessage(count: number) {
    this.msgAlertCount = count;
    const redNum = $(".mcmodder-rednum");
    if (count) {
      const text = count.toLocaleString();
      redNum.text(text).show();
    } else {
      redNum.hide();
    }
    this.updateTitleNode();
  }

  /** 只按缓存数据重画铃铛（站点刷新消息数时用，不发请求） */
  private applyBellNotify() {
    this.notifyUnreadMessage(this.msgSiteCount);
  }

  updateTitleNode(count = this.msgAlertCount) {
    if (count) {
      const text = count.toLocaleString();
      this.titleNode.text(`[${text} 条新消息!] ${this.title} - MC 百科`);
    } else {
      this.titleNode.text(this.title + " - MC 百科");
    }
  }

  private onEditorSetup() {
    if (!editor._setup_old) {
      editor._setup_old = editor._setup;
      editor._setup = (a: any) => {
        editor._setup_old(a);
        new EditorInit(this).run();
      };
    }
  }

  editorLoad() {
    new GeneralEditInit(this).run();
    if (!$("#editor-frame").length) return;
    if (typeof editor === "undefined") {
      const editorObserver = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
          if ((mutation.target as Element).id === "editor-frame" && mutation.removedNodes.length) {
            this.onEditorSetup();
          }
        }
      });
      editorObserver.observe($("#editor-frame").get(0), { childList: true });
    } else {
      this.onEditorSetup();
    }
  }

  static readonly URL_JSON_POST = "https://bbs.mcmod.cn/forum.php?mod=viewthread&tid=1281";

  updateScreenAttachedFrame(node: HTMLElement) {
    const parent = node.parentElement;
    if (!parent) return;
    this.screenAttachedFrame = this.screenAttachedFrame.filter((e) => e.node != node);
    this.screenAttachedFrame.push({
      node: node,
      parentPosY: Utils.getAbsolutePos(parent).y,
      parentHeight: parent.getBoundingClientRect().height,
    });
    // this.screenAttachedFrame = $(".mcmodder-screenattached");
  }

  applyCustomFont(font: number) {
    switch (font) {
      case 1: {
        Utils.addStyle(`* {font-family: ${Values.assets.font.fontFamily[font]};}`);
        break;
      }
      case 2:
      case 3: {
        // 字体走 Google Fonts：非阻塞加载，3 秒未完成就放弃，避免大陆网络拖住首屏
        document.getElementById("mcmodder-font-link")?.remove();
        const preconnectAPI = document.createElement("link");
        preconnectAPI.rel = "preconnect";
        preconnectAPI.href = "https://fonts.googleapis.com";
        const preconnectStatic = document.createElement("link");
        preconnectStatic.rel = "preconnect";
        preconnectStatic.href = "https://fonts.gstatic.com";
        preconnectStatic.crossOrigin = "anonymous";
        const fontLink = document.createElement("link");
        fontLink.id = "mcmodder-font-link";
        fontLink.rel = "stylesheet";
        fontLink.href = String(Values.assets.font.link[font]);
        // 先按 print 加载（不阻塞渲染），加载完成后再切回 all
        fontLink.media = "print";
        fontLink.onload = () => {
          fontLink.media = "all";
        };
        fontLink.onerror = () => fontLink.remove();
        document.head.append(preconnectAPI, preconnectStatic, fontLink);
        window.setTimeout(() => {
          if (fontLink.isConnected && fontLink.media === "print") fontLink.remove();
        }, 3000);
        Utils.addStyle(`* {font-family: ${Values.assets.font.fontFamily[font]};}`);
        break;
      }
    }
  }

  tableFix() {
    $("table [align]")
      .each((_, c) => {
        $(c).css("text-align", $(c).attr("align"));
      })
      .removeAttr("align");
    $("table [valign]")
      .each((_, c) => {
        $(c).css("vertical-align", $(c).attr("valign"));
      })
      .removeAttr("valign");
    Utils.addStyle("th {text-align: center;}");
  }

  updateNightMode() {
    // 以配置为唯一事实来源，把 isNightMode 同步回来。
    // 夜间模式偏好（跟随系统/手动）会在 main() 中直接写配置而不经过 cycleNightModePreference()，
    // 跨标签页同步也会只改配置；若此处不刷新字段，依赖 isNightMode 的代码
    // （UEditor iframe、部分图表回调）就会与页面实际的 dark 状态脱节。
    const nightMode = !!this.configRepository.getSettings("nightMode");
    this.isNightMode = nightMode;
    const preference = this.configRepository.getSettings("nightModePreference") ?? 0;
    const icon = $("#mcmodder-night-switch i");
    // 按钮三态图标：跟随系统（半圆）/ 手动夜间（月亮）/ 手动日间（灯泡）；
    // .on（金色辉光）仍表示当前生效为日间
    icon.attr(
      "class",
      `${preference === 0 ? "fa fa-adjust" : preference === 2 ? "fa fa-moon-o" : "fa fa-lightbulb-o"}${nightMode ? "" : " on"}`,
    );
    $("#mcmodder-night-switch").attr(
      "data-original-title",
      preference === 0
        ? "夜间模式：跟随系统（点击切换）"
        : preference === 2
          ? "夜间模式：手动·夜间（点击切换）"
          : "夜间模式：手动·日间（点击切换）",
    );
    // UEditor 弹窗内容 iframe（挂在 #edui_fixedlayer 下）也一并同步，
    // 覆盖「弹窗开着时切换夜间模式」的情形；固定层尚不存在时选择结果为空，安全跳过
    const dialogIframeDocs = $("#edui_fixedlayer iframe")
      .get()
      .map((iframe) => (iframe as HTMLIFrameElement).contentDocument)
      .filter((doc): doc is Document => !!doc?.documentElement);
    if (nightMode) {
      icon.removeClass("on");
      if ($("#item-cover-preview-img").first().attr("src") === Values.assets.mcmod.imagesNone) {
        $("#item-cover-preview-img").attr("src", Values.assets.nightMode.imagesNone);
      }
      $("html").addClass("dark");
      this.ueditorFrame.forEach((e) => {
        e.$document?.find("html").addClass("dark");
      });
      dialogIframeDocs.forEach((doc) => doc.documentElement.classList.add("dark"));
      this.elementColorDictionary.forEach((color, e) => {
        const darkenColor = this.elementColorCache.get(color);
        e.style.setProperty("color", darkenColor!);
      });
    } else {
      icon.addClass("on");
      if ($("#item-cover-preview-img").first().attr("src") === Values.assets.nightMode.imagesNone) {
        $("#item-cover-preview-img").attr("src", Values.assets.mcmod.imagesNone);
      }
      $("html").removeClass("dark");
      this.ueditorFrame.forEach((e) => {
        e.$document?.find("html").removeClass("dark");
      });
      dialogIframeDocs.forEach((doc) => doc.documentElement.classList.remove("dark"));
      this.elementColorDictionary.forEach((_color, e) => {
        e.style.setProperty("color", this.elementColorDictionary.get(e)!);
      });
    }
  }

  updatePageWidth() {
    const icon = $("#mcmodder-pagewidth-switch i");
    if (this.configRepository.getSettings("preferredWiderScreen")) {
      this.preferredWiderScreen = true;
      Utils.addStyle(
        `.col-lg-12.mcmodder-class-page, .col-lg-12.common-center {width: 100%; margin: 0; margin-top: calc(6 * var(--mcmodder-width-padding-1));}`,
        "mcmodder-pagewidth-controller",
      );
      icon.attr("class", "fa fa-compress");
    } else {
      this.preferredWiderScreen = false;
      $("#mcmodder-pagewidth-controller").remove();
      icon.attr("class", "fa fa-expand");
    }
  }

  /**
   * 把夜间模式偏好（0 跟随系统 / 1 固定日间 / 2 固定夜间）解析为生效值 nightMode。
   * 跟随系统时取 prefers-color-scheme，手动偏好下系统变化不再覆写；
   * 仅在生效值将要变化时写入，避免无意义的跨标签页同步。
   */
  private migrateNightModePreference() {
    // v2.4.1- 夜间模式配置兼容：布尔自适应开关升级为三态偏好（0 跟随系统 / 1 日间 / 2 夜间）。
    // 关闭过自适应的老用户按当时的生效值固定下来，避免升级后被系统配色突然改写外观。
    // 必须先于一切对 nightMode 的解析/写入执行（构造函数中调用）。
    const adaptableNightMode = this.configRepository.getSettings("adaptableNightMode");
    if (adaptableNightMode !== undefined) {
      this.configRepository.setSettings(
        "nightModePreference",
        adaptableNightMode ? 0 : this.configRepository.getSettings("nightMode") ? 2 : 1,
      );
      this.configRepository.deleteSettings("adaptableNightMode");
    }
  }

  /** 按当前配置计算夜间生效值（纯读取，不写存储）。 */
  private computeNightMode(): boolean {
    const preference = this.configRepository.getSettings("nightModePreference") ?? 0;
    return preference === 1
      ? false
      : preference === 2 || window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  private resolveNightMode() {
    const nightMode = this.computeNightMode();
    if (this.configRepository.getSettings("nightMode") !== nightMode) {
      this.configRepository.setSettings("nightMode", nightMode);
    }
  }

  /** 循环切换夜间模式偏好：跟随系统 → 日间 → 夜间 → 跟随系统，并立即解析生效。 */
  private cycleNightModePreference() {
    const next = (((this.configRepository.getSettings("nightModePreference") ?? 0) + 1) % 3) as
      0 | 1 | 2;
    this.configRepository.setSettings("nightModePreference", next);
    this.resolveNightMode();
    // 显式再调一次，避免依赖 Vue watcher 的异步时机。
    this.updateNightMode();
    Utils.commonMsg(
      next === 0
        ? "夜间模式：已恢复跟随系统"
        : next === 1
          ? "夜间模式：已固定为日间"
          : "夜间模式：已固定为夜间",
    );
  }

  copyright() {
    $(".copyleft")
      .last()
      .append(`<br>☆ MCMODDER v${Values.mcmodderVersion} ☆ ——MC百科编审辅助工具`);
    $(".sidebar-plan .space").last().append(`<br>mcmodder-v${Values.mcmodderVersion}`);
  }

  /**
   * # 副作用挂载
   * 这里是少数用 `watch` 监听配置变化驱动全局行为的入口（夜间模式、宽窄屏切换）。
   * 新增「配置变化 → 全局行为」的关联时，优先考虑在此追加 watch。
   */
  private watchRef() {
    this.configRepository.watchSettingsRef("nightMode", () => this.updateNightMode());
    // 跨标签页修改偏好时，本页重新解析生效值（nightMode 的写入由上面的 watcher 应用）；
    // 图标与 tooltip 取决于偏好本身，故无论生效值是否变化都要刷新一次按钮外观
    this.configRepository.watchSettingsRef("nightModePreference", () => {
      this.resolveNightMode();
      this.updateNightMode();
    });
    this.configRepository.watchSettingsRef("preferredWiderScreen", () => this.updatePageWidth());
  }

  main() {
    // v2.2- 自定义字体配置兼容
    const useNotoSans = this.configRepository.getSettings("useNotoSans");
    if (useNotoSans) {
      this.configRepository.deleteSettings("useNotoSans");
      this.configRepository.setSettings("customFont", 2);
    }

    // 多账号切换已整体移除（2026-11-04）：清掉旧版本留下的账号列表与快捷切换游标
    this.configRepository.pruneLegacySettings(["myProfiles", "lastUid"]);

    // 迁移（2026-11-10）：「改动说明」候选不再预置出厂模板——从既有存储里滤除
    // 上游 EditReason.json 的种子项，用户自攒的候选保留
    const storedReasons = this.configRepository.get("inputList", "editReasons");
    if (storedReasons) {
      const filtered = storedReasons.filter(
        (s) => !Values.legacyEditReasonSeeds.includes(typeof s === "string" ? s : s.value),
      );
      if (filtered.length !== storedReasons.length) {
        this.configRepository.set("inputList", "editReasons", filtered);
      }
    }

    const customFont = this.configRepository.getSettings("customFont");
    if (customFont) {
      this.applyCustomFont(customFont);
    }

    // 关闭主页&整合包区广告
    // 只扫带内联样式的 span：原实现遍历全文档所有 span，每次加载白付一次 O(全页) 扫描
    $("span[style]")
      .filter((_, e) => e.getAttribute("style") === Values.adTitleCss)
      .html("<a>× 广告</a>")
      .find("a")
      .click((e) => {
        $(e.currentTarget).parent().parent().hide();
      });

    // 屏蔽 AdSense 广告：marker 类驱动 base.css 的隐藏规则（ins 由 CSS 兜底，与加载时序无关）；
    // 壳容器（只含 script/ins、无正文的 div）由这里一次性标记后随类隐藏
    if (this.configRepository.getSettings("blockAds")) {
      document.documentElement.classList.add("mcmodder-block-ads");
      $("ins.adsbygoogle")
        .parent()
        .each((_, e) => {
          const shell = e as HTMLElement;
          const hasContent = [...shell.childNodes].some(
            (n) =>
              (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "") ||
              (n instanceof Element &&
                n.nodeType === Node.ELEMENT_NODE &&
                !/^(SCRIPT|INS)$/.test(n.tagName)),
          );
          if (!hasContent) shell.classList.add("mcmodder-ad-shell");
        });
    }

    // 自定义物品类型
    this.itemTypeList = this.configRepository.getSettings("itemCustomTypeList") ?? [];
    if (typeof this.itemTypeList === "string") {
      this.configRepository.setSettings("itemCustomTypeList", Values.itemCustomTypeList);
      this.itemTypeList = Values.itemCustomTypeList;
    }
    this.itemTypeList = this.itemTypeList!.concat(Values.itemDefaultTypeList);

    // 表格修复
    if (this.configRepository.getSettings("tableFix")) {
      this.tableFix();
    }

    if (this.configRepository.getSettings("tableLeftAlign")) {
      // StyleLoader CSS
      const f = (e: Element) => {
        const c = $(e).next();
        if (c.attr("class") === "figcaption")
          c.css("width", e.getBoundingClientRect().width + "px");
      };
      $(".common-text .figure .lazy").each((_, _e) => {
        const e = _e as HTMLImageElement;
        if (e.complete) {
          f(e);
        } else {
          e.onload = () => f(e);
        }
      });
    } else Utils.addStyle(".common-text .figure {align-items: center;}");
    $(
      ".mold, .progress-list, .class-item-type li, .post-block, .tag li, .mcver li a, .tools-list li a, .edit-tools span, .comment-row, .comment-channel-list li a, .class-relation-list .relation li, .btn, .mcmodder-gui-alert, .edit-tools > span, .center-sub-menu a, .center-content.admin-list a, .center-card-block.badges, .center-card-border, .modlist-block, .common-center .maintext .item-give, .common-center .post-row .postname .tool li a",
    ).addClass("mcmodder-content-block");
    $(".common-nav .line").html('<i class="fa fa-chevron-right" />');
    $(".oredict-ad, .worldgen-list-ad").remove();
    if (this.configRepository.getSettings("defaultBackground") != "none") {
      $("body")
        .filter((_, c) => $(c).css("background-image") === "none")
        .css({
          background: "var(--mcmodder-image-background)",
          "background-size": "cover",
        });
    }

    // 个人菜单（旧「UI 美化」开关已移除，以下行为恒启用）
    const insertPos = $(".header-user .header-layer-block:first-child");
    if (insertPos.length) {
      const myProfile = this.configRepository.getAllProfile() as Partial<Profile>;
      // 头像地址与昵称来自站点资料，按不可信内容处理：URL 过 safeURL、文本转义
      const avatarURL = Utils.safeURL(myProfile.avatar);
      const nicknameSafe = Utils.escapeHTML(myProfile.nickname || $(".header-user-name").text());
      const avatar = avatarURL
        ? `<a href="${Utils.getCenterURL(this.currentUID)}" target="_blank">
            <img alt="${nicknameSafe}" src="${Utils.escapeHTML(avatarURL)}">
          </a>`
        : $(".header-user-avatar").html();
      const lvNumber = Number(myProfile.lv) || 0;
      const lv = lvNumber
        ? `<span class="mcmodder-profile-lv common-user-lv lv-${lvNumber}">Lv.${lvNumber}</span>`
        : "";
      $(`<div class="mcmodder-profile">${avatar}<p>${nicknameSafe} ${lv}</p></div>`).insertBefore(
        insertPos,
      );

      $(".header-user .header-layer-block li a").each((_, _c) => {
        const c = $(_c);
        const text = c.text();
        c.replaceWith(
          `<a${
            c.text() === "退出登录"
              ? ` id="common-logout-btn"`
              : ` href="${c.prop("href")}" target="_blank"`
          }><i class="${(Values.iconMap as any)[text]}"/><span>${text}</span><i class="fa fa-chevron-right" /></a>`,
        );
      });
    }

    const textArea = $(".text-area.common-text, .item-content.common-text, .post-row");
    // 去除正文异常背景 + 收集夜间正文颜色：只读内联样式、单次查询、单遍处理。
    // 旧实现用 jQuery .css() 读计算样式（每节点两次 getComputedStyle），写回后又让
    // 下一次读取失效，长正文页会逐节点触发样式重算（审计 F-12 的遗留）。
    if (!this.configRepository.getSettings("disableAutoStyleFix")) {
      textArea.find("[style]").each((_i, _e) => {
        const e = _e as HTMLElement;
        const inline = e.style;
        if (inline.backgroundColor === "rgb(255, 255, 255)") inline.backgroundColor = "";
        if (/^span$/i.test(e.tagName) && inline.color === "rgb(0, 0, 0)") inline.color = "";
        const css = inline.getPropertyValue("color");
        if (!css) return;
        const color = Utils.parseRGB(css);
        if (!color) return;
        const colorStr = Utils.RGBToColor(color);
        const nightColorStr = Utils.reverseColorBrightness(color);
        this.elementColorDictionary.set(e, colorStr);
        this.elementColorCache.set(colorStr, nightColorStr);
      });
    }

    // Swiper 调整
    $(".swiper-container").each((_, _container) => {
      const container = $(_container);
      new Swiper(container);
    });

    // 夜间模式正文颜色自动适配已并入上面的单遍处理

    // 夜间模式偏好解析为生效值；跟随系统时监听系统配色变化（手动偏好下回调不会覆写）
    this.resolveNightMode();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      this.resolveNightMode();
    });

    // 先挂载夜间按钮再同步外观：updateNightMode 会按偏好刷新图标与 tooltip，
    // 若晚于挂载调用，手动偏好的用户首屏会一直显示跟随系统的默认图标
    $(
      '<button id="mcmodder-night-switch" data-toggle="tooltip" data-original-title="夜间模式"><i class="fa fa-adjust"></i></button>',
    )
      .appendTo(".header-container .header-search, .top-right")
      .click(() => this.cycleNightModePreference());

    this.updateNightMode();
    this.updatePageWidth();

    this.preferredWiderScreen = this.configRepository.getSettings("preferredWiderScreen") ?? false;
    $(`<button id="mcmodder-pagewidth-switch" data-toggle="tooltip" data-original-title="宽窄屏切换">
      <i class="fa fa-${this.preferredWiderScreen ? "compress" : "expand"}"></i>
    </button>`)
      .appendTo(".header-container .header-search")
      .click(() => {
        this.configRepository.setSettings("preferredWiderScreen", !this.preferredWiderScreen);
      });

    if (this.currentUID) {
      $(
        '<button id="mcmodder-message-center" data-toggle="tooltip" data-original-title="消息中心"><i class="fa fa-bell-o"></i></button>',
      )
        .appendTo(".header-container .header-search")
        .click(() => {
          GM_openInTab(`${this.hostname}/message/`, { active: true });
          this.msgSiteCount = 0;
          this.notifyUnreadMessage(0);
        });
    }

    this.msgSiteCount = Number($(".header-user-msg b").text());
    $(".header-user-msg").remove();
    $(`<div class="mcmodder-rednum">`).appendTo("#mcmodder-message-center");
    this.applyBellNotify();

    if (typeof editor != "undefined") this.callEditor();
    else if (
      document.querySelector("#edui1_iframeholder, #edui1, .edui-default, .common-comment-block") ||
      window.location.hostname === "center.mcmod.cn" ||
      /\/(edit|add|sandbox)\//.test(window.location.pathname)
    ) {
      // 只有确实可能出现编辑器的页面才挂全文档观察者。
      // .common-comment-block 必须在列：资料页 / 个人空间的短评编辑器是懒创建的
      // （聚焦输入区时才 UE.getEditor），页面加载时 #edui1 / .edui-default 均不存在。
      // center.mcmod.cn 必须无条件在列：个人中心是 SPA，主页内容（含短评块）在
      // 数据拉取后才渲染——门控在 main() 时求值必然扑空，而留言板编辑器晚至
      // 数秒后才懒加载，观察者一旦缺席便无人接管（回归修复 2026-11-06）。
      // 观察者在编辑器出现后自行 disconnect，编辑器创建时机不确定，不能设超时。
      this.generalEditorObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // TODO: 取消锁定导航栏

    if (this.isV4) {
      window.addEventListener(
        "scroll",
        Utils.animationThrottle(() => {
          // 个人目录不会超出屏幕右边界
          const header = $(".header-user").get(0).getBoundingClientRect();
          const menuWidth = 400;
          if (
            header.x + header.width / 2 + menuWidth / 2 >=
            window.innerWidth - Values.headerContainerHeight
          ) {
            $(".header-panel").addClass("mcmodder-header-panel-fixed");
          } else {
            $(".header-panel").removeClass("mcmodder-header-panel-fixed");
          }
        }),
        {
          passive: true,
        },
      );
      window.dispatchEvent(new Event("resize"));
    }

    // 实时通讯
    const autoNotifyDelay = this.configRepository.getSettings("alwaysNotify");
    if (
      !window.location.href.includes("https://admin.mcmod.cn/") &&
      typeof fuc_topmenu_sync != "undefined" &&
      autoNotifyDelay &&
      autoNotifyDelay >= 0.1
    )
      setInterval(
        () => {
          this.utils
            .createRequest(
              {
                url: `${this.hostname}/frame/CommonHeader/`,
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest",
                  Origin: this.hostname,
                  Referer: window.location.href,
                  Priority: "u=0",
                  Pragma: "no-cache",
                  "Cache-Control": "no-cache",
                },
                data: "version=4.0",
              },
              "实时通讯",
            )
            .then((resp) => {
              try {
                const data = JSON.parse(resp.responseText);
                const siteCount =
                  data.state || !data.user.login || !data.user.msg_count ? 0 : data.user.msg_count;
                this.msgSiteCount = siteCount;
                // 站点刷新消息数时同步页头铃铛
                this.applyBellNotify();
              } catch (e) {
                if (e instanceof SyntaxError) {
                  console.error("Failed to parse data: " + resp.responseText);
                }
              }
            });
        },
        Math.max(autoNotifyDelay * 1e3 * 60, 6e3),
      );

    // 单个 Init 的异常只记日志不中断循环：document-start 时页面 DOM 残缺，
    // 任何 init 都可能踩到未就绪的结构，不能让一个 init 带死其余全部功能
    this.initList
      .filter((init) => init.canRun())
      .forEach((init) => {
        try {
          init.run();
        } catch (e) {
          console.error(`[MCModder-Lite] ${init.constructor.name}.run() 异常：`, e);
        }
      });

    const areaLeft = $(".left");
    const areaRight = $(".class-info-right");
    if (areaLeft.length && areaRight.length) {
      setTimeout(() => {
        const heightLeft = areaLeft.get(0).getBoundingClientRect().height;
        const heightRight = areaRight.get(0).getBoundingClientRect().height;
        $(".col-lg-12.right").css("min-height", `${Math.max(heightLeft, heightRight)}px`);
      }, 1e3);
    }

    $(".common-background").remove();
    $("#key").css("color", "var(--mcmodder-color-text)");

    window.addEventListener(
      "scroll",
      Utils.throttle(() => {
        this.screenAttachedFrame.forEach((e) => {
          e.node.style.top =
            Math.max(0, window.scrollY - e.parentPosY + Values.headerContainerHeight) + "px";
        });
      }, 16),
      {
        passive: true,
      },
    );

    this.updateItemTooltip();
    document.addEventListener("pointerover", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement && target.classList.contains("tooltip"))) {
        return;
      }
      target.remove();
    });

    this.watchRef();
    this.copyright();
    this.updateTitleNode();
  }
}
