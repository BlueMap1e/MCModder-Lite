import type { ConfigRepository } from "../config/ConfigRepository";
import { Mcmodder } from "../Mcmodder";
import { Utils } from "../Utils";
import { Values } from "../Values";
import { addUploadFileButton } from "./UploadFileButton";

/**
 * 百科原生 UEditor 的封装基类：把 `editor` 实例解包成一系列好用的 DOM 引用，
 * 并施加一批与编辑页强相关的通用增强（注入样式、夜间模式、按钮现代化、上传文件按钮（默认关闭）、高度/宽度自适应、编辑量统计）。
 *
 * # 关于「不写成 Vue 组件」
 * UEditor 是百科技能自带的 iframe + 原生 DOM，工具栏、颜色选择器、下拉菜单等 UI 全部由百科自己的
 * 代码创建，且大量逻辑依赖其内部类名（`.edui-*`）与全局对象（`editor`、`baidu.editor`）。
 * 强行套 Vue 组件反而要与之对抗，因此这里选择**直接操作原生 DOM**。
 *
 * # 初始化时序（重要）
 * 本类**不在构造函数里同步初始化**，而是等到 `editor.ready()` 回调后再 `setTimeout(0)` 才执行 {@link init}。
 * 原因：百科的编辑器是异步渲染的，`ready` 触发时 iframe 及其内部 document 才刚挂载，
 * 立刻访问 `editor.iframe` / `editor.document` 很可能拿到 undefined 或半成品节点。
 * 这里用 `setTimeout(0)` 把初始化推迟到当前任务之后，确保 DOM 已就绪。
 *
 * 该回调由 {@link Mcmodder.callEditor} 在观察到 `#edui1_iframeholder` 出现子节点后才触发，
 * 因此整条链路是「DOM 出现 → observer 触发 → 延迟 300ms 构造 → ready 回调 → 再延迟一拍 → init」。
 * 各层延迟都是历史踩坑后加的，**请勿随意缩短或去掉**。
 *
 * @see {@link AdvancedUEditor} 在本类之上追加编辑器增强特性。
 */
export class UEditor {
  /** 百科的原生编辑器实例（宿主全局 `editor`），用它调用 `setContent`/`addListener` 等 API */
  editor: any;
  /** 全局上下文，用于访问配置、样式表与夜间模式状态 */
  parent: Mcmodder;
  /** 配置仓库（`parent.configRepository` 的快捷引用） */
  configs: ConfigRepository;
  /** 编辑器的最外层容器，即百科的 `#editor-ueeditor` */
  outerFrame?: Element;
  /** {@link outerFrame} 的 jQuery 包装 */
  $outerFrame?: JQuery;
  /** 内层容器，即工具栏与 iframe 所在的 `#edui1` */
  innerFrame?: Element;
  /** {@link innerFrame} 的 jQuery 包装 */
  $innerFrame?: JQuery;
  /** 外层容器的首个子节点（承载实际高度的那个盒子） */
  frame?: HTMLElement;
  /** 编辑器工具栏（`.edui-toolbar`） */
  toolbar?: JQuery;
  /** 编辑内容 iframe */
  iframe?: HTMLIFrameElement;
  /** {@link iframe} 的 jQuery 包装 */
  $iframe?: JQuery;
  /** iframe 的父节点，高度自适应时直接改它 */
  iframeHolder?: HTMLElement;
  /** iframe 的 window 对象（与页面主 window 不同） */
  window?: Window;
  /** {@link window} 的 jQuery 包装 */
  $window?: JQuery;
  /** iframe 的 document，后续绝大多数正文操作都作用在它上面 */
  document?: Document;
  /** {@link document} 的 jQuery 包装 */
  $document?: JQuery;
  /** iframe 内的 `<head>`，动态脚本/样式需插入到这里（而非主文档） */
  head?: HTMLHeadElement;
  /** {@link head} 的 jQuery 包装 */
  $head?: JQuery;
  /** iframe 内的 `<body>`，即用户编辑的正文所在节点 */
  body?: HTMLElement;
  /** {@link body} 的 jQuery 包装 */
  $body?: JQuery;
  /** 观察 {@link body} 直接子节点变化的兜底观察器（contentchange 有漏触发路径） */
  bodyObserver?: MutationObserver;

  /**
   * @param editor 百科的原生编辑器实例。
   * @param parent 全局上下文。
   */
  constructor(editor: any, parent: Mcmodder) {
    this.parent = parent;
    this.configs = parent.configRepository;
    this.editor = editor;
    // ready 回调触发时 iframe 内的 DOM 尚未完全就绪，需再让出一个任务周期，详见类注释
    editor.ready(() => {
      setTimeout(() => {
        this.init(editor);
      }, 0);
    });
  }

  /**
   * 初始化：解包编辑器各层 DOM 引用，登记到 {@link Mcmodder.ueditorFrame}，并施加通用增强。
   * 子类可覆写本方法，但**必须先调用 `super.init(editor)`**。
   *
   * @param editor 百科的原生编辑器实例。
   */
  protected init(editor: any) {
    const iframe = editor.iframe;

    this.outerFrame = $(iframe).parents("#editor-ueeditor").get(0) as HTMLElement;
    this.$outerFrame = $(this.outerFrame);
    this.innerFrame = $(iframe).parents("#edui1").get(0) as HTMLElement;
    this.$innerFrame = $(this.innerFrame);
    this.frame = this.outerFrame.childNodes.item(0) as HTMLElement;
    this.toolbar = this.$outerFrame.find(".edui-toolbar");
    this.iframe = iframe;
    this.$iframe = $(this.iframe || "");
    this.iframeHolder = this.iframe?.parentNode as HTMLElement;
    this.window = editor.window;
    this.$window = $(this.window || "");
    this.document = editor.document;
    this.$document = $(this.document || "");
    this.head = this.document?.head;
    this.body = this.document?.body;
    this.$head = $(this.head || "");
    this.$body = $(this.body || "");

    // 把自己登记进全局列表，并给**所有**已登记的编辑器 iframe 补注入样式与夜间模式
    // （含此前已初始化的那些，保证页面上多个编辑器时样式一致）
    this.parent.ueditorFrame.push(this);
    const isDark = $("html").hasClass("dark");
    this.parent.ueditorFrame.forEach((e) => {
      if (!e.document) return;
      Utils.addStyle(this.parent.css, "", e.document);
      // 以父页面实际的 dark 类为准，而不是父实例上可能滞后的 isNightMode：
      // 夜间模式自适应、跨标签页同步等场景下字段可能尚未刷新，
      // 若此时漏掉 dark 类，iframe 会继续使用亮色变量；
      // 而 UEditor 又在 iframe 内写死了 p { color:#333 }，于是出现深色底 + 深色字。
      e.$document?.find("html").toggleClass("dark", isDark);
    });

    // 弹窗内容 iframe 的样式注入整页挂一次即可，多个编辑器实例不会重复挂载
    UEditor.attachDialogStyleListener(this.parent);

    // 现代化按钮
    // if (this.configs.get("mcmodderUI")) {
    const toolBar = this.$outerFrame.find(".edui-editor-toolbarboxinner");
    for (let i = 0; i < Values.ueButton1.length; i++) {
      toolBar
        .find(`.edui-for-${Values.ueButton1[i]} .edui-icon`)
        .addClass("mcmodder-edui-box fa fa-" + Values.ueButton2[i])
        .css("background-image", "none");
    }
    toolBar
      .find(".edui-arrow")
      .addClass("mcmodder-edui-arrow fa fa-caret-down")
      .css("background-image", "none");
    // }

    // 「上传文件」按钮：站点工具栏只给了图片上传，附件上传接口虽有却没有入口。默认关闭，需在设置里开启。
    // 短评编辑器与资料编辑器（`AdvancedUEditor`）的工具栏都注入，避免正文里只能放图片。
    if (this.configs.getSettings("uploadFileButton")) {
      addUploadFileButton(this);
    }

    // 宽度自适应：监听窗口 resize，并立即手动触发一次（iframe 内的文档不会自动继承外层尺寸）
    window.addEventListener("resize", () => this.widthAutoResize());
    window.dispatchEvent(new Event("resize"));

    this.updateEditorStats();

    this.editor.addListener("contentChange", () => {
      this.ensureTrailingParagraph();
      this.updateEditorStats();
    });
    // contentchange 并不在所有正文变更路径上触发：UEditor 的按键处理（如 Firefox 下
    // Backspace 合并删除尾随空段落）会拦截默认行为后直接改 DOM，部分路径不 fire 事件，
    // 导致补段落失效、高度滞留。挂一个只看 body 直接子节点的 MutationObserver 兜底，
    // 保证补段落与高度始终跟随真实 DOM。我们的补段落自身也会触发观察器，但
    // ensureTrailingParagraph 幂等（补完最后一个元素就不是 TABLE 了），不会形成循环。
    this.bodyObserver = new MutationObserver(() => this.scheduleBodySync());
    this.bodyObserver.observe(this.body!, { childList: true });
    this.attachTableEscapeKeyHandler();
    // 兜底的兜底：contentchange / MutationObserver 这类事件路径在个别环境下存在
    // 无法本地复现的失效（Tampermonkey 沙箱 realm 与页面 realm 的调度差异，
    // 实机中高频退格可击穿，而本地 Playwright 无法复现）。selectionchange 是浏览器
    // 原生事件（光标移动/选区变化必发，不经过 UEditor），配合低频 watchdog 轮询，
    // 二者都只做幂等修复：即使事件路径全部失守，状态最迟在下一次光标移动或 1.5s 内自愈。
    this.document!.addEventListener("selectionchange", () => this.scheduleBodySync());
    window.setInterval(() => this.scheduleBodySync(), 1500);
    // 初次就绪时正文可能就以表格结尾（如 Markdown → HTML 重写后的资料），补一次
    this.ensureTrailingParagraph();
  }

  /** body 直接子节点变化后的同步任务是否已在队列中（微任务去重） */
  private bodySyncQueued = false;

  /** 在微任务里去重执行补段落 + 高度重算，同一批连续 DOM 变更只处理一次 */
  private scheduleBodySync() {
    if (this.bodySyncQueued) return;
    this.bodySyncQueued = true;
    queueMicrotask(() => {
      this.bodySyncQueued = false;
      this.ensureTrailingParagraph();
      this.updateEditorStats();
    });
  }

  /**
   * 「表格末行末列的空单元格」按键逃逸。
   *
   * UEditor 的表格按键处理会把方向键接管为表格内导航（preventDefault 后自己移动光标），
   * 光标位于空单元格时尤其如此：ArrowDown 被拦截、End/ArrowRight/Tab 全是格间移动，
   * 即使表格后已有尾随段落，键盘也无法离开表格——这是"表格墙"在快速删空单元格后的
   * 残留形态（实测 Firefox，无脚本对照下有内容的单元格同样逃不出去，是原版即有的墙）。
   * 这里在 iframe 文档的**捕获阶段**拦截：光标折叠于表格最后一个单元格且该单元格为空、
   * 按下 ArrowDown/ArrowRight 时，先把光标移到表格之后的块级元素（没有则先补尾随段落），
   * 再阻止 UEditor 的导航接管。有内容的单元格交给原生行为（配合尾随段落原生即可逃逸）。
   */
  private attachTableEscapeKeyHandler() {
    const doc = this.document;
    if (!doc || !this.body || !this.window) return;
    doc.addEventListener(
      "keydown",
      (ev: KeyboardEvent) => {
        if (ev.key !== "ArrowDown" && ev.key !== "ArrowRight") return;
        if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const sel = this.window!.getSelection();
        if (!sel || !sel.isCollapsed || !sel.anchorNode) return;
        let node: Node | null = sel.anchorNode;
        while (node && (node as Element).tagName !== "TD" && (node as Element).tagName !== "TH") {
          node = node.parentNode;
        }
        const cell = node as HTMLTableCellElement | null;
        const row = cell?.parentElement as HTMLTableRowElement | null;
        const table = row?.closest("table");
        if (!cell || !row || !table) return;
        // 只处理真正的"右下角"单元格：合并单元格的长尾场景交给原版行为
        const lastRow = table.rows[table.rows.length - 1];
        if (!lastRow || cell !== lastRow.cells[lastRow.cells.length - 1]) return;
        if (cell.textContent?.trim() !== "") return;
        // 表格之后已有块级元素就直接用它；表格是正文最后元素时先补尾随段落再逃逸。
        // UEditor 的按键监听挂在 document 冒泡阶段，捕获阶段 stopPropagation 可拦下它。
        let target = table.nextElementSibling;
        if (!target && this.body!.lastElementChild === table) {
          this.ensureTrailingParagraph();
          target = table.nextElementSibling;
        }
        if (!target || (target as Element).tagName === "TABLE") return;
        ev.preventDefault();
        ev.stopPropagation();
        const range = doc.createRange();
        range.setStart(target, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        // 同步 UEditor 内部选区，避免它基于旧位置做出错误的状态更新
        try {
          this.editor.selection.getRange().setStart(target, 0).collapse(true).select();
        } catch {
          /* 内部选区同步失败不影响已设好的原生光标 */
        }
      },
      true,
    );
  }

  /**
   * 若正文的最后一个元素是表格，则在末尾补一个空段落。
   *
   * 资料以表格结尾时，正文里没有可放置光标的"表格之后的落点"：
   * 浏览器（Firefox / Chromium 均如此）会把光标困在最后一个单元格里，且此时新建的行
   * 会从表格继承 UEditor 自带的 `table { white-space: nowrap }`（新版浏览器会把它
   * 以内联 `text-wrap-mode: nowrap` 烤进新行），导致表格后的文字永远不换行，
   * 表格因此成为无法绕过的"一堵墙"。百科原版保存的资料通常带有这个尾随空段落
   * （即用户所知的"最后一行通常会自动给定一个换行符"），但 Markdown → HTML 重写
   * 等场景产生的正文没有它。这里在内容变化后按需补上，恢复原版体验。
   */
  private ensureTrailingParagraph() {
    if (!this.body || !this.document) return;
    if (this.body.lastElementChild?.tagName === "TABLE") {
      const p = this.document.createElement("p");
      p.innerHTML = "<br/>";
      this.body.appendChild(p);
    }
  }

  /** 是否已给宿主文档挂上「弹窗 iframe 样式注入」监听（监听本身与具体编辑器实例无关） */
  private static dialogStyleListenerAttached = false;

  /**
   * 给宿主文档挂上「UEditor 弹窗 iframe 样式注入」监听（整页一次）。
   *
   * UEditor 的对话框（插入图片/链接/表格等）渲染在宿主页的 `#edui_fixedlayer` 下，
   * 其正文是独立的 iframe（由 `iframeUrlMap` 指向 `/ueditor/dialogs/` 下的页面）。
   * 宿主页与编辑器正文 iframe 的样式都作用不到这里，弹窗因此在夜间模式下仍是白底黑字。
   * 本样式表（`parent.css`）内含 `base.css` 针对弹窗页面结构的规则
   * （`body .tabbody .panel`、`body #remote input.text` 等），
   * 再配合 `parent.ueditorDialogCss` 中的弹窗专属夜间规则，注入后即可随 `dark` 类生效。
   *
   * 用捕获阶段的 `load` 事件而非 MutationObserver：iframe 的 `load` 不冒泡，
   * 但捕获监听可以收到；且弹窗每次打开都会重载 iframe，注入时机天然跟随内容加载，
   * 夜间模式中途切换后重新打开弹窗也能拿到正确的状态。
   */
  private static attachDialogStyleListener(parent: Mcmodder) {
    if (UEditor.dialogStyleListenerAttached) return;
    UEditor.dialogStyleListenerAttached = true;
    document.addEventListener(
      "load",
      (event) => {
        const iframe = event.target;
        if (!(iframe instanceof HTMLIFrameElement)) return;
        // UEditor 的对话框与含 iframe 的弹出层都挂在固定层下，据此过滤掉页面里无关的 iframe
        if (!iframe.closest("#edui_fixedlayer")) return;
        const doc = iframe.contentDocument;
        // 弹窗页面与主站同源，正常都能取到；跨域场景静默放弃
        if (!doc?.documentElement) return;
        Utils.addStyle(parent.css + parent.ueditorDialogCss, "mcmodder-dialog-style", doc);
        doc.documentElement.classList.toggle("dark", parent.isNightMode);
      },
      true,
    );
  }

  /**
   * 编辑器当前是否处于全屏：全屏时百科会给 `.edui-editor` 加 `position: absolute`，
   * 据此判断（比匹配全屏按钮的状态更可靠）。
   */
  isEditorFullScreen() {
    return (
      this.$outerFrame?.find(".edui-editor").prop("style").getPropertyValue("position") ===
      "absolute"
    );
  }

  /**
   * 设置编辑器高度。
   *
   * @param height 正文区域应有的高度（px），实际写入时会再加上工具栏高度。
   */
  resizeHeight(height: number) {
    this.frame?.style?.setProperty(
      "height",
      height + $("#edui1_toolbarbox").first().prop("offsetHeight") + "px",
      "important",
    );
    this.iframeHolder?.style?.setProperty("height", height + "px", "important");

    // this.editor.setHeight(height);
  }

  /**
   * 计算正文应有的高度：以**最后一个子元素**的底边为准（而非逐个累加），
   * 这样能正确处理嵌套与浮动；结果不低于 120px。
   *
   * @returns 正文高度（px）。
   */
  protected autoCalculateHeight() {
    let height = 50;
    if (this.$body && this.$body.children().length && this.window) {
      const rect = this.$body.children().last().get(0).getBoundingClientRect();
      height += rect.top + rect.height + this.window.pageYOffset;
    }
    /* this.$body.children().each((_, e) => {
      let cs = getComputedStyle(e);
      height += (e.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + 0.2);
    }); */
    height = Math.max(height, 120);
    return height;
  }

  /** 按计算出的正文高度调整编辑器高度 */
  protected heightAutoResize() {
    const height = this.autoCalculateHeight();
    this.resizeHeight(height);
  }

  /** 宽度自适应：让编辑器内层与 iframe 容器撑满可用宽度 */
  widthAutoResize() {
    // $("#mcmodder-mdeditor, #editor-ueeditor").css("width", "100%");
    $("#edui1, #edui1_iframeholder").css("width", "100%");
  }

  /** 内容变化后要重算的东西，目前只有高度 */
  updateEditorStats() {
    this.heightAutoResize();
  }
}
