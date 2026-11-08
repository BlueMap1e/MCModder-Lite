import {
  GM_addValueChangeListener,
  GM_cookie,
  GM_getValue,
  GM_setValue,
  GM_xmlhttpRequest,
  type GmResponseEvent,
  type GmResponseType,
  type GmXmlhttpRequestOption,
} from "$";
import { AnimationFrameScheduler } from "./AnimationFrameScheduler";
import { ConfigRepository } from "./config/ConfigRepository";
import { Mcmodder } from "./Mcmodder";
import { Values } from "./Values";

export interface ThemeColorSet {
  tc1: string;
  tc2: string;
}

/**
 * 全局工具类：承载无状态的静态工具函数，以及依赖 `Mcmodder` 实例上下文的辅助方法。
 * 静态方法多为纯函数或宿主 DOM 操作；实例方法通过 `parent`/`configs` 访问全局上下文与配置。
 */
export class Utils {
  private readonly parent: Mcmodder;
  readonly configs: ConfigRepository;

  /** @param parent 全局上下文 `Mcmodder` 实例 */
  constructor(parent: Mcmodder) {
    this.parent = parent;
    this.configs = new ConfigRepository(parent);
  }

  private static m_isMac: boolean | undefined;
  /** 判断当前是否为 macOS（结果缓存，避免重复读取 UA） */
  static isMac() {
    return (this.m_isMac ??= navigator.userAgent.includes("Macintosh"));
  }

  private static m_isMobileClient: boolean | undefined;
  /** 判断当前是否为移动端客户端（匹配 Mobi/Android/iPhone，结果缓存） */
  static isMobileClient() {
    return (this.m_isMobileClient ??= !!(
      navigator.userAgent.match(/Mobi/i) ||
      navigator.userAgent.match(/Android/i) ||
      navigator.userAgent.match(/iPhone/i)
    ));
  }

  /** 打开 QQ 互联的 OAuth 登录窗口 */
  static toQzoneLogin() {
    window.open(
      `${Values.hostname}/plugs/loginConnect/qqConnect/oauth/index.php`,
      "TencentLogin",
      "width=755,height=515,menubar=0,scrollbars=0,resizable=0,status=1,titlebar=0,toolbar=0,location=1",
    );
  }

  /** 弹出统一样式的消息提示（优先使用百科的 `common_msg`，否则回退到 `swal`） */
  static commonMsg(message: string, isok: boolean = true, title: string = "") {
    const defaultTitle = isok ? "提示" : "错误";
    if (typeof common_msg === "function") {
      common_msg(title || defaultTitle, message, isok ? "ok" : "err");
    } else if (typeof swal === "function") {
      // 使用了 v3 的特殊 swal
      // eslint-disable-next-line
      (swal as any)({
        type: isok ? "success" : "error",
        title: defaultTitle,
        text: message,
        button: false,
        timer: 3e3,
      });
    }
  }

  /**
   * 基于 SweetAlert2 创建模态框，并支持事件拦截：
   * 当捕获阶段的事件发生在模态框内部时，阻止其继续向外冒泡并交由对应的回调处理。
   */
  static createModal(
    option: SweetAlertOption,
    interceptEvents: Record<string, (ev: Event) => unknown> = {},
  ) {
    swal.fire(option).then(() => {
      Object.entries(events).forEach(([eventName, callback]) => {
        window.removeEventListener(eventName, callback);
      });
    });
    const modal = $(".swal2-modal").get(0);
    const events: Record<string, (this: Window, ev: Event) => unknown> = {};
    Object.entries(interceptEvents).forEach(([eventName, callback]) => {
      events[eventName] = (ev: Event) => {
        const target = ev.target;
        if (target instanceof Node && !(target instanceof Document) && modal.contains(target)) {
          ev.stopPropagation();
          callback(ev);
        }
      };
    });
    Object.entries(events).forEach(([eventName, callback]) => {
      window.addEventListener(eventName, callback, true);
    });
  }

  /** 转发到百科原生的 `showTaskTip`，弹出任务/成就提示 */
  static showTaskTip(
    imageUrl: string,
    title: string,
    text: string,
    achieveTime: string,
    progress: number,
    rewardExp: number | string,
  ) {
    showTaskTip(imageUrl, title, text, achieveTime, progress, rewardExp);
  }

  /** 从配置中读取主/副主题色，返回 `{ tc1, tc2 }` */
  static getThemeColors = (configs: ConfigRepository): ThemeColorSet => {
    return {
      tc1: configs.getSettings("themeColor1")!,
      tc2: configs.getSettings("themeColor2")!,
    };
  };

  /** 将 `value` 限制在 `[min, max]` 区间内 */
  static clamp(value: number, min = 0, max = 1) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  /** 判断 `value` 是否落在 `[min, max]` 区间内 */
  static isClamp(value: number, min = 0, max = 1) {
    return value >= min && value <= max;
  }

  /** 比较两个点分版本号：`v1>v2` 返回 1，`v1<v2` 返回 -1，相等返回 0 */
  static versionCompare(v1: string, v2: string) {
    const p1 = v1.split(".").map(Number);
    const p2 = v2.split(".").map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  /** 校验 `version` 是否受指定 `loaderID` 支持（支持列表为空视为全支持，`>=` 前缀表示最低版本） */
  static validateVersionForLoaderID(version: string, loaderID: string) {
    const list = Values.loaderSupportVersions[
      loaderID as keyof typeof Values.loaderSupportVersions
    ] as Readonly<string[]> | undefined;
    return (
      !list ||
      list.includes(version) ||
      (list[0].includes(">=") && this.versionCompare(version, list[0].split(">=")[1]) > -1)
    );
  }

  /** 将 `loaderName` 映射为 loaderID 后，校验 `version` 是否受支持 */
  static validateVersionForLoaderName(version: string, loaderName: string) {
    return this.validateVersionForLoaderID(
      version,
      Values.loaderID[loaderName as keyof typeof Values.loaderID],
    );
  }

  /** 简易深拷贝（JSON 序列化实现，不保留函数/原型等） */
  static simpleDeepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /** 就地删除对象中值为 `undefined`/`null`/`NaN` 的属性 */
  static deleteEmptyProperties(obj: object) {
    let val;
    (Object.keys(obj) as (keyof typeof obj)[]).forEach((key) => {
      val = obj[key];
      if (val === undefined || val === null || (typeof val === "number" && isNaN(val)))
        delete obj[key];
    });
  }

  static isKeyOfObject<T extends Readonly<Record<PropertyKey, unknown>>>(
    obj: T,
    key: PropertyKey,
  ): key is keyof T {
    return Object.hasOwn(obj, key);
  }

  static getKeyValueOfObject<T extends Readonly<Record<PropertyKey, unknown>>>(
    obj: T,
    key: PropertyKey,
  ) {
    return obj[key] as ValueOf<T> | undefined;
  }

  static isHTMLElement(node: Node): node is HTMLElement {
    return node.nodeType === Node.ELEMENT_NODE;
  }

  static isTextNode(node: Node): node is Text {
    return node.nodeType === Node.TEXT_NODE;
  }

  /**
   * 事件目标是否位于输入控件 / 可编辑区。
   *
   * 全局级快捷键（尤其是会 `preventDefault` 的）必须先放行这类目标，把 `Ctrl+A` / `Ctrl+C` /
   * `Ctrl+Z` 交还给浏览器和站点原生输入框；否则一旦绑在 `document.body` / `html` 上，
   * 全站所有普通输入框的编辑操作都会被吞掉。
   */
  static isEditableTarget(e: { target?: EventTarget | null } | null | undefined) {
    const target = e?.target;
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || !!target.closest("input, textarea, select"))
    );
  }

  /** 生成 `[l, r)` 内步长为 `step` 的整数序列（`l`/`r` 须为整数，`step` 为正整数） */
  static createRange(l: number, r: number, step = 1) {
    if (!Number.isInteger(l) || !Number.isInteger(r)) {
      throw new Error("端点必须是整数。");
    }
    if (l > r) {
      throw new Error("左端点必须不大于右端点。");
    }
    if (!Number.isInteger(step) || step < 1) {
      throw new Error("步长必须是正整数。");
    }
    return Array.from({ length: (r - l) / step }, (_, i) => i * step + l);
  }

  /** 当前用户组是否可以进入通用后台 */
  static hasAdminAccess(permission: Permission) {
    return permission === "editor" || permission === "manager" || permission === "admin";
  }

  /** 当前用户组是否可以进入模组区审核，且可以通过/退回编辑（即并非只是审核助理） */
  static hasVerifyOperateAccess(permission: Permission) {
    return permission === "manager" || permission === "admin";
  }

  /** 当前用户组是否可以进入模组区审核（包括审核助理） */
  static hasVerifyAccess(permission: Permission) {
    return this.hasAdminAccess(permission);
  }

  /** 按 id 取出交互数据并立即清除该条目；id 为空时返回 undefined */
  getInteract(id: string | null) {
    if (id === null || id === undefined) return undefined;
    const result = this.configs.get("mcmodderInteracts", id);
    this.configs.set("mcmodderInteracts", id, null);
    return result;
  }

  /** 将交互数据写入一个随机 id 的条目，并返回该 id */
  setInteract(value: unknown) {
    const id = Utils.randStr(8);
    this.configs.set("mcmodderInteracts", id, value);
    return id;
  }

  /** 将形如 `rgb(r,g,b)` 的字符串转换为 `#rrggbb` */
  static rgbToHex(s: string) {
    return (
      "#" +
      s
        .replace(/(?:\(|\)|RGB|rgb)*/g, "")
        .split(",")
        .map((e) => parseInt(e))
        .reduce((p, q) => (p << 8) + q)
        .toString(16)
        .padStart(6, "0")
    );
  }

  /** 获取指定小数位精度的数字格式化器（`Intl.NumberFormat`） */
  static getPrecisionFormatter(minDigit = 0, maxDigit = 2) {
    return Intl.NumberFormat("en-US", {
      minimumFractionDigits: minDigit,
      maximumFractionDigits: maxDigit,
    });
  }

  /** 将毫秒时长格式化为易读字符串（如 `1m 23s`），负值返回 `-` */
  static getFormattedTime(t: number) {
    if (t < 0) return `-`;
    if (t < 1e3) return `${t}ms`;
    if (t < 5e3) return `${Math.floor(t / 1e3)}s ${t % 1e3}ms`;
    if (t < 6e4) return `${Math.floor(t / 1e3)}s`;
    if (t < 3.6e6) return `${Math.floor(t / 6e4)}m ${Math.floor((t % 6e4) / 1e3)}s`;
    if (t < 8.64e7) return `${Math.floor(t / 3.6e6)}h ${Math.floor((t % 3.6e6) / 6e4)}m`;
    return `${Math.floor(t / 8.64e7)}d`;
  }

  /** 将时长格式化为中文相对时间（如 `3天前`/`5分钟后`），差值小于 1s 返回 `刚刚` */
  static getFormattedChineseTime(t: number) {
    let a;
    const b = t < 0 ? "前" : "后";
    t = t < 0 ? -t : t;
    if (t < 1e3) return `刚刚`;
    else if (t < 6e4) a = `${Math.floor(t / 1e3)}秒`;
    else if (t < 3.6e6) a = `${Math.floor(t / 6e4)}分`;
    else if (t < 8.64e7) a = `${Math.floor(t / 3.6e6)}时`;
    else if (t < 2.592e9) a = `${Math.floor(t / 8.64e7)}天`;
    else if (t < 3.1536e10) a = `${Math.floor(t / 2.592e9)}月`;
    else a = `${Math.floor(t / 3.1536e10)}年`;
    return a + b;
  }

  /** 将数字缩写为带 k/M/G/T 单位的字符串 */
  static getFormattedNumber(n: number) {
    if (n >= 1e12) return (n / 1e12).toFixed(Number(n % 1e12 !== 0)) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(Number(n % 1e9 !== 0)) + "G";
    if (n >= 1e6) return (n / 1e6).toFixed(Number(n % 1e6 !== 0)) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(Number(n % 1e3 !== 0)) + "k";
    return n.toString();
  }

  /** 拼接模组完整名称：`[abbr] name (ename)`；接受三个字符串参数或一个 `Class` 对象 */
  static getClassFullName(name: string, ename: string, abbr: string): string;
  static getClassFullName(data: Class): string | undefined;
  static getClassFullName(...args: [name: string, ename: string, abbr: string] | [data: Class]) {
    const name = (args.length === 1 ? args[0].name : args[0]).trim();
    const ename = (args.length === 1 ? args[0].englishName : args[1]).trim();
    const abbr = (args.length === 1 ? args[0].abbr : args[2]).trim();
    if (!name) return undefined;
    let res = "";
    if (abbr) res += `[${abbr}] `;
    res += name;
    if (ename) res += ` (${ename})`;
    return res;
  }

  /** 解析模组完整名称，拆分为 `{ className, classEname, classAbbr }` */
  static parseClassFullName(fullName: string): ClassName {
    let abbr = "",
      name = "",
      ename = "",
      indexOf: number;
    if (fullName) {
      fullName = fullName.trim();
      if (fullName.charAt(0) === "[") {
        indexOf = fullName.indexOf("]");
        abbr = fullName.slice(1, indexOf);
        fullName = fullName.slice(indexOf + 1).trim();
      } else {
        abbr = "";
      }
      indexOf = fullName.lastIndexOf(" (");
      if (indexOf >= 0) {
        name = fullName.slice(0, indexOf);
        ename = fullName.slice(indexOf + 2, -1);
      } else {
        name = fullName;
        ename = "";
      }
    }
    return {
      className: name.trim(),
      classEname: ename.trim(),
      classAbbr: abbr.trim(),
    };
  }

  /** 拼接物品完整名称：`name (ename)`，无英文名时仅返回名称 */
  static getItemFullName(name: string, ename?: string | null) {
    let res = name.trim();
    const trimedEname = ename?.trim();
    if (trimedEname) res += ` (${trimedEname})`;
    return res;
  }

  /** 解析物品完整名称，拆分为 `{ name, englishName }` */
  static parseItemFullName(fullName: string) {
    const pos = fullName.lastIndexOf(" (");
    const name = pos >= 0 ? fullName.slice(0, pos) : fullName;
    const englishName = pos >= 0 ? fullName.slice(pos + 2, -1) : "";
    return { name, englishName };
  }

  /** 下载图片 URL 并转为 Base64 DataURL，失败返回 null */
  static async imageURL2base64(url: string) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return Utils.blob2Base64(blob);
    } catch (error) {
      console.error("Error converting image to Base64: ", error);
      return null;
    }
  }

  /** 将 Blob 读取为 Base64 DataURL 字符串 */
  static async blob2Base64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else resolve("");
      };
      reader.onerror = () => reject;
      reader.readAsDataURL(blob);
    });
  }

  /** 将 Base64 DataURL 转换为 Blob，优先按前缀识别 MIME 类型 */
  static base642Blob(base64: string, defaultMimeType = "application/octet-stream") {
    const mimeType = Utils.getBase64MimeType(base64) ?? defaultMimeType;
    const base64Data = Utils.removeBase64ImgPrefix(base64)!;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  /** 若字符串缺少 DataURL 前缀，则补上 `data:<mime>;base64,`（默认 image/png） */
  static appendBase64ImgPrefix(v?: string, defaultMimeType?: string) {
    const mimeType = defaultMimeType ?? "image/png";
    if (v && v.slice(0, 11) !== "data:image/") return `data:${mimeType};base64,${v}`;
    return v;
  }

  /** 去除 DataURL 前缀，仅保留 Base64 内容 */
  static removeBase64ImgPrefix(v?: string) {
    if (v && v.slice(0, 11) === "data:image/") return v.split(";base64,")[1];
    return v;
  }

  /** 从 DataURL 中提取 MIME 类型，非 DataURL 返回 undefined */
  static getBase64MimeType(v?: string) {
    if (v === undefined) return undefined;
    if (!v.startsWith("data:")) return undefined;
    const pos = v?.indexOf(";base64,");
    if (pos < 0) return undefined;
    return v.slice(5, pos);
  }

  /** 延迟 `ms` 毫秒的异步等待 */
  static sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
  }

  /**
   * 高亮指定 jQuery 节点：添加 `mcmodder-mark-<color>` 类，可滚动到视口并在超时后移除高亮。
   *
   * @param jQueryNode 要高亮的目标节点。
   * @param color 高亮颜色，限 `gold`/`pink`/`aqua`/`greenyellow` 之一。
   * @param timeout 高亮持续毫秒数；`0`（默认）表示不自动移除。
   * @param scrollIntoView 是否先将节点平滑滚动到视口中央。
   */
  static highlight(jQueryNode: JQuery, color = "gold", timeout = 0, scrollIntoView = false) {
    const validColor = ["gold", "pink", "aqua", "greenyellow"];
    if (!validColor.includes(color)) {
      console.error(`Highlight color parameter must be within: [${validColor.join(", ")}]`);
      return;
    }
    const className = `mcmodder-mark-${color}`;
    jQueryNode.addClass(className);
    if (scrollIntoView)
      jQueryNode.get(0).scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    if (timeout > 0) setTimeout(() => jQueryNode.removeClass(className), timeout);
  }

  /** 从 URL 中提取指定类型路径下的标识（字符串，如 `item/123.html` → `123`） */
  static abstractLastFromURL(url: string, typeList: string | string[]) {
    if (!url || !typeList) return "";
    if (!(typeList instanceof Array)) typeList = [typeList];
    let res;
    for (const type of typeList) {
      if (url.includes(type)) {
        res = url.split(`/${type}/`)?.[1]?.split(".html")?.[0]?.split("/")?.[0];
        break;
      }
    }
    return res ?? "";
  }

  /** 从 URL 中提取指定类型路径下的数字 ID（如 `item/123.html` → 123） */
  static abstractIDFromURL(url: string, typeList: string | string[]) {
    return Number(Utils.abstractLastFromURL(url, typeList));
  }

  /** 按物品 ID 生成图标 URL（宽度限 32/36/128/144，`ver` 用于缓存版本号） */
  static getImageURLByItemID(id: number, width = 32, ver = 0) {
    const validSize = [32, 36, 128, 144];
    if (!validSize.includes(width)) {
      console.error(`Image size parameter must be within: [${validSize.join(", ")}]`);
      return "";
    }
    if (!id) return `https://i.mcmod.cn/item/icon/${width}x${width}/0.png?v=${ver}`;
    return `https://i.mcmod.cn/item/icon/${width}x${width}/${Math.floor(id / 1e4)}/${id}.png?v=${ver}`;
  }

  /** 生成物品资料页 URL */
  static getItemURL(id: number) {
    return `${Values.hostname}/item/${id}.html`;
  }

  /** 生成物品类型列表页 URL */
  static getItemTypeURL(classID: number, typeID: number) {
    return `${Values.hostname}/item/list/${classID}-${typeID}.html`;
  }

  /** 生成模组页 URL */
  static getClassURL(id: number) {
    return `${Values.hostname}/class/${id}.html`;
  }

  /** 生成矿物词典/物品标签页 URL */
  static getOredictURL(oredict: string) {
    return `${Values.hostname}/oredict/${oredict}-1.html`;
  }

  /** 生成用户个人中心页 URL */
  static getCenterURL(id: number) {
    return `https://center.mcmod.cn/${id}/`;
  }

  /** 生成新窗口打开的目标 `<a>` 元素，文本缺省为 URL 本身 */
  static URLToAnchor(url: string, text?: string) {
    return $("<a>")
      .attr({
        target: "_blank",
        href: url,
      })
      .text(text ?? url);
  }

  /**
   * 将文本节点**替换**为 `<a>` 元素，同时根据原始的内容来设置该元素的内嵌文本与 `href`。
   * 如果原始内容不符合链接格式，则直接跳过以避免 XSS。
   *
   * @param data 如果额外传入该参数，则原始内容将以该参数为准
   */
  static textToAnchor(text: Text, data?: string) {
    const raw = data ?? text.data;
    // 文本来自审核附言等用户内容：只放行 http(s) 与站内相对路径，
    // 否则 `javascript:` 之类的协议会被写进 href 并在点击时执行
    const link = Utils.safeURL(raw);
    if (!link) return;
    const anchor = document.createElement("a");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.href = link;
    anchor.innerText = raw;
    text.replaceWith(anchor);
    return anchor;
  }

  /** 将 `#rrggbb`/`#rrggbbaa`/`#rgb`/`#rgba` 颜色字符串解析为 RGB/RGBA 对象，格式错误抛出异常 */
  static colorToRGB(color: string): RGB | RGBA {
    const colorFormatError = new Error("颜色代码的格式不正确。");
    const colorParseError = new Error("颜色代码解析失败。");
    if (color.charAt(0) != "#") {
      throw colorFormatError;
    }
    const dec = parseInt(color.slice(1), 16);
    if (isNaN(dec) || dec < 0) {
      throw colorParseError;
    }
    switch (color.length) {
      case 7:
        return {
          r: dec >> 16,
          g: (dec & 0x00ff00) >> 8,
          b: dec & 0x0000ff,
        };
      case 9:
        return {
          r: dec >>> 24,
          g: (dec & 0x00ff0000) >> 16,
          b: (dec & 0x0000ff00) >> 8,
          a: dec & (0x000000ff / 0xff),
        };
      case 4:
      case 5: {
        const t = ["#"];
        for (let i = 1; i < color.length; i++) {
          t.push(color.charAt(i).repeat(2));
        }
        return this.colorToRGB(t.join(""));
      }
      default:
        throw colorFormatError;
    }
  }

  /** 解析 `rgb(...)`/`rgba(...)` 字符串为 RGB/RGBA 对象，无法匹配时返回 null */
  static parseRGB(str: string): RGB | RGBA | null {
    if (/rgb\([0-9]{1,3},\s[0-9]{1,3},\s[0-9]{1,3}\)/.test(str)) {
      const numList = str.match(/[0-9]{1,3}/g)!.map(Number);
      return {
        r: numList[0],
        g: numList[1],
        b: numList[2],
      };
    } else if (/rgba\([0-9]{1,3},\s[0-9]{1,3},\s[0-9]{1,3},\s[0-9]{1,3}\)/.test(str)) {
      const numList = str.match(/[0-9]{1,3}/g)!.map(Number);
      return {
        r: numList[0],
        g: numList[1],
        b: numList[2],
        a: numList[3],
      };
    } else {
      return null;
    }
  }

  /** 将 RGB/RGBA 对象转为 `#rrggbb`/`#rrggbbaa` 字符串 */
  static RGBToColor(rgb: RGB) {
    const a = (rgb as RGBA).a;
    let dec = (rgb.r << 16) + (rgb.g << 8) + rgb.b;
    if (a != undefined) dec = dec * 256 + Math.round(a * 0xff);
    return "#" + dec.toString(16).padStart(a != undefined ? 8 : 6, "0");
  }

  /** 将 RGB/RGBA 对象转为 HSL/HSLA 对象（h 为 0-360 度，s/l 为 0-100） */
  static RGBToHSL(rgb: RGB): HSL | HSLA {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h: number,
      s: number,
      l = (max + min) / 2;

    if (delta === 0) {
      h = s = 0;
    } else {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / delta) % 6;
          break;
        case g:
          h = (b - r) / delta + 2;
          break;
        case b:
          h = (r - g) / delta + 4;
          break;
        default:
          h = -1;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
      s = Math.round(s * 100);
    }

    l = Math.round(l * 100);
    const a = (rgb as RGBA).a;
    if (a != undefined) {
      return { h, s, l, a };
    }
    return { h, s, l };
  }

  /** 将 HSL/HSLA 对象转为 RGB/RGBA 对象 */
  static HSLToRGB(hsl: HSL): RGB | RGBA {
    const h = hsl.h;
    const s = hsl.s / 100;
    const l = hsl.l / 100;
    const a = (hsl as HSLA).a;

    const c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;

    if (0 <= h && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (60 <= h && h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (120 <= h && h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (180 <= h && h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (240 <= h && h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (300 <= h && h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    if (a != undefined) {
      return { r: r, g: g, b: b, a: a };
    }
    return { r: r, g: g, b: b };
  }

  /** 将颜色字符串或 RGB 对象转为 HSL 对象 */
  static colorToHSL(color: string | RGB) {
    const rgb = typeof color === "string" ? this.colorToRGB(color) : color;
    return this.RGBToHSL(rgb);
  }

  /** 将 HSL 对象转为 `#rrggbb` 字符串 */
  static HSLToColor(hsl: HSL) {
    return this.RGBToColor(this.HSLToRGB(hsl));
  }

  /** 按比例调整颜色明度：`ratio<1` 变暗，`ratio>1` 向纯色方向提亮 */
  static adjustColorBrightness = (color: string | RGB, ratio: number) => {
    const hsl = Utils.colorToHSL(color);
    let lightness = hsl.l;
    if (ratio < 1) lightness *= ratio;
    else lightness += (100 - lightness) * (ratio - 1);
    return this.HSLToColor({
      h: hsl.h,
      s: hsl.s,
      l: this.clamp(lightness, 0, 100),
    });
  };

  /** 反转颜色明度（lightness 取 100-l） */
  static reverseColorBrightness = (color: string | RGB) => {
    const hsl = Utils.colorToHSL(color);
    return this.HSLToColor({
      h: hsl.h,
      s: hsl.s,
      l: 100 - hsl.l,
    });
  };

  /** 设置颜色的明度为指定 lightness 值（自动限制在 0-100） */
  static setColorBrightness = (color: string | RGB, lightness: number) => {
    const hsl = Utils.colorToHSL(color);
    return this.HSLToColor({
      h: hsl.h,
      s: hsl.s,
      l: this.clamp(lightness, 0, 100),
    });
  };

  /** 设置颜色的透明度（alpha 自动限制在 0-1），返回 `#rrggbbaa` */
  static setColorAlpha(color: string, alpha: number) {
    const rgb = this.colorToRGB(color);
    return this.RGBToColor({
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: this.clamp(alpha),
    } as RGBA);
  }

  /** 生成跨平台 Ctrl 组合键：macOS 用 metaKey，其余用 ctrlKey */
  static getXplatCtrlCombinationKey(keyCode: number | string | Key): Key {
    if (typeof keyCode === "string") {
      keyCode = keyCode.toUpperCase().charCodeAt(0);
    }
    if (typeof keyCode === "number") {
      keyCode = { keyCode };
    }
    if (this.isMac()) {
      keyCode.metaKey = true;
    } else {
      keyCode.ctrlKey = true;
    }
    return keyCode;
  }

  /** 将 Key 对象拆解为修饰键+主键的字符串序列（如 `["Ctrl","Shift","C"]`） */
  static keyToRawList(e: Key) {
    // if (!(e instanceof Object)) e = JSON.parse(e);
    if (!e.key && !e.keyCode) return [];
    const k = [];
    let c;
    if (e.ctrlKey) k.push(Utils.isMac() ? "Control" : "Ctrl");
    if (e.shiftKey) k.push("Shift");
    if (e.altKey) k.push(Utils.isMac() ? "Option" : "Alt");
    if (e.metaKey) k.push(Utils.isMac() ? "Command" : "Meta");
    if (!e.key || !["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      if (e.keyCode) {
        if ((e.keyCode >= 65 && e.keyCode <= 90) || (e.keyCode >= 98 && e.keyCode <= 123))
          c = String.fromCharCode(e.keyCode).toUpperCase();
        else if (e.keyCode >= 48 && e.keyCode <= 57) c = String.fromCharCode(e.keyCode);
        else c = e.key;
      } else c = e.key;
      k.push(c);
    }
    return k;
  }

  /** 将 Key 对象渲染为 `Ctrl + C` 形式的文本，空键返回「未指定」 */
  static keyToString(e: Key) {
    const list = Utils.keyToRawList(e);
    if (!list.length) return "未指定";
    return list.join(" + ");
  }

  /**
   * 在 Vue 组件中，请优先使用 `KeyDisplay` 子组件
   */
  static keyToHTML(e: Key) {
    const list = Utils.keyToRawList(e);
    const isMac = Utils.isMac();
    const HTMLList = list.map((data) => {
      if (isMac) {
        switch (data) {
          case "Ctrl":
          case "Control":
            data = "⌃‌";
            break;
          case "Shift":
            data = "⇧";
            break;
          case "Alt":
          case "Option":
            data = "⌥";
            break;
          case "Meta":
          case "Command":
            data = "⌘";
        }
      }
      return `<kbd>${data}</kbd>`;
    });
    return HTMLList.join("");
  }

  /** 判断按键 `b` 是否与 `a` 匹配（修饰键必须全满足，keyCode 忽略大小写差异） */
  static isKeyMatch(a: Key, b: Key) {
    // b需要匹配a
    if (!Object.keys(a).length) return false;
    if (a.ctrlKey && !b.ctrlKey) return false;
    if (a.shiftKey && !b.shiftKey) return false;
    if (a.altKey && !b.altKey) return false;
    if (a.metaKey && !b.metaKey) return false;
    if (a.keyCode && b.keyCode) {
      let keyCodeA = a.keyCode;
      let keyCodeB = b.keyCode;
      if (keyCodeA >= 98 && keyCodeA <= 123) keyCodeA -= 32;
      if (keyCodeB >= 98 && keyCodeB <= 123) keyCodeB -= 32;
      if (keyCodeA !== keyCodeB) return false;
    }
    return true;
  }

  /** 判断按键 `b` 是否与配置中名为 `a` 的快捷键匹配 */
  isKeyMatchConfig(a: KeysOfType<Settings, Key>, b: Key) {
    const config = this.configs.getSettings(a);
    if (config === undefined) {
      return false;
    }
    return Utils.isKeyMatch(config, b);
  }

  /** 生成指定长度的随机字符串（字母数字+下划线） */
  static randStr(l = 32) {
    const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";
    const n = t.length;
    let r = "";
    for (let i = 0; i < l; i++) r += t.charAt(Math.floor(Math.random() * n));
    return r;
  }

  private static readonly escapeHTMLMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  /** 转义 HTML 特殊字符，防止注入 */
  static escapeHTML(str: string | number) {
    return str
      .toString()
      .replace(/[&<>"']/g, (char) => Utils.escapeHTMLMap[char as keyof typeof Utils.escapeHTMLMap]);
  }

  /**
   * 校验外部数据里的 URL，返回可安全写入 `href` / `src` 的值。
   *
   * 只放行 http(s) 与站内相对路径；`javascript:`、`data:`、`vbscript:` 等协议一律返回空串。
   * 调用方拿到空串时应退化为纯文本，而不是把原始值写进属性。
   */
  static safeURL(url: string | null | undefined): string {
    const raw = String(url ?? "").trim();
    if (!raw) return "";
    // 去掉控制字符，避免 `java\nscript:` 之类的绕过（字符级过滤，避免正则控制字符告警）
    const cleaned = Array.from(raw)
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join("");
    if (!cleaned) return "";
    // 站内相对路径：单个 `/`、锚点、查询串，以及 `./`、`../`
    if (/^\/(?!\/)/.test(cleaned) || /^[?#]/.test(cleaned) || /^\.\.?\//.test(cleaned)) {
      return cleaned;
    }
    try {
      const parsed = new URL(cleaned, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch {
      // 非法 URL，按不安全处理
    }
    return "";
  }

  /** 文本节点里的 URL 匹配规则（不跨越空白与 HTML 定界符） */
  private static readonly textURLPattern = /https?:\/\/[^\s"'<>]+/g;

  /** 请求失败提示的去抖间隔（毫秒） */
  private static lastRequestErrorAt = 0;

  /** 发包排期游标：独立 GM 键，避免每次请求都改写整份设置 */
  private static requestCursor = 0;
  private static requestCursorLoaded = false;

  /** 请求日志先攒在内存，2 秒或页面隐藏时再落盘，避免每个请求都读改写整份日志 */
  private static pendingRequestLogs: string[] = [];
  private static requestLogFlushTimer?: ReturnType<typeof setTimeout>;
  private static requestLogFlushBound = false;

  /** 排队一条请求日志；达到阈值立即落盘，否则最多每 2 秒写一次 */
  private static queueRequestLog(content: string) {
    Utils.pendingRequestLogs.push(content);
    if (!Utils.requestLogFlushBound) {
      Utils.requestLogFlushBound = true;
      window.addEventListener("pagehide", () => Utils.flushRequestLogs());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") Utils.flushRequestLogs();
      });
    }
    if (Utils.pendingRequestLogs.length >= 32) {
      Utils.flushRequestLogs();
      return;
    }
    if (!Utils.requestLogFlushTimer) {
      Utils.requestLogFlushTimer = window.setTimeout(() => Utils.flushRequestLogs(), 2000);
    }
  }

  /** 把内存里的请求日志合并进持久化日志，并裁掉超出上限的旧记录 */
  private static flushRequestLogs() {
    if (Utils.requestLogFlushTimer) {
      window.clearTimeout(Utils.requestLogFlushTimer);
      Utils.requestLogFlushTimer = undefined;
    }
    if (!Utils.pendingRequestLogs.length) return;
    const pending = Utils.pendingRequestLogs.splice(0);
    const logs = GM_getValue("mcmodderLogger")?.split(";").filter(Boolean) || [];
    logs.push(...pending);
    const max = Values.MAX_REQUEST_COUNT / 10;
    if (logs.length > max) logs.splice(0, logs.length - max);
    GM_setValue("mcmodderLogger", logs.join(";"));
  }

  /** 请求失败统一提示：多个并发请求同时失败时只提示一次，避免刷屏 */
  private static notifyRequestError(reason: string) {
    const now = Date.now();
    if (now - Utils.lastRequestErrorAt < 5000) return;
    Utils.lastRequestErrorAt = now;
    Utils.commonMsg(`${reason}（详见控制台）`, false);
  }

  /**
   * 把元素**文本节点**里的 URL 就地转成 `<a>`，不改动任何标签与属性。
   *
   * 与「先取 `.html()` 再字符串替换」相比，这条路径不会把用户文本重新解析成 HTML，
   * 也不会误改已有标签的属性，是处理短评 / 附言这类外部内容的唯一安全做法。
   *
   * @returns 转换出的链接数量
   */
  static linkifyTextNodes(root: Node | JQuery): number {
    const node: Node | undefined =
      root && typeof (root as JQuery).get === "function" ? (root as JQuery).get(0) : (root as Node);
    if (!node) return 0;
    const doc = node.ownerDocument ?? document;
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (textNode) => {
        const parent = textNode.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("a, script, style, textarea")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

    let count = 0;
    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? "";
      const matches = [...text.matchAll(Utils.textURLPattern)];
      if (!matches.length) continue;
      const fragment = doc.createDocumentFragment();
      let cursor = 0;
      for (const match of matches) {
        const matchText = match[0];
        // 与旧实现一致：URL 在第一个非 Latin-1 字符（中文/全角标点）处截断
        const chars = Array.from(matchText);
        const asciiEnd = chars.findIndex((char) => char.charCodeAt(0) > 0xff);
        const bounded = asciiEnd === -1 ? matchText : chars.slice(0, asciiEnd).join("");
        // 句末标点不属于 URL
        const url = bounded.replace(/[),.;!?，。；！？、]+$/, "");
        const start = match.index ?? 0;
        if (start > cursor) fragment.append(text.slice(cursor, start));
        const safe = Utils.safeURL(url);
        if (safe) {
          const anchor = doc.createElement("a");
          anchor.href = safe;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = url;
          fragment.append(anchor);
        } else {
          fragment.append(url);
        }
        cursor = start + url.length;
        count++;
      }
      if (cursor < text.length) fragment.append(text.slice(cursor));
      textNode.replaceWith(fragment);
    }
    return count;
  }

  /** 获取元素相对文档的绝对坐标（含滚动偏移） */
  static getAbsolutePos(node: Element) {
    const rect = node.getBoundingClientRect();
    return {
      x: window.scrollX + rect.left,
      y: window.scrollY + rect.top,
    };
  }

  // private static readonly segmenter = typeof Intl.Segmenter === "function" ?
  //   new Intl.Segmenter("zh-Hans", {
  //     granularity: "word"
  //   }) : undefined;

  // static tokenize(text: string, withRange?: false): string[];
  // static tokenize(text: string, withRange: true): [string, [number, number]][];
  // static tokenize<V extends boolean | undefined = false>(text: string, withRange: V = undefined as V) {
  //   type VT = [string, [number, number]];
  //   type VF = string;
  //   const lowerCase = text.toLowerCase();
  //   const cnTokens: (VT | VF)[] = [];

  //   // 分词
  //   if (Utils.segmenter !== undefined) {
  //     for (const { index, segment, isWordLike } of Utils.segmenter.segment(lowerCase)) {
  //       if (!isWordLike || segment.length === 2) { // 二元组已被下文操作覆盖
  //         continue;
  //       }
  //       if (withRange) {
  //         cnTokens.push([segment, [index, index + segment.length]] );
  //       } else {
  //         cnTokens.push(segment);
  //       }
  //     }
  //   }

  //   // 二元组
  //   const reg = /[\p{Script=Han}]+/gu;
  //   if (withRange) {
  //     for (const run of lowerCase.matchAll(reg)) {
  //       const index = run.index;
  //       const substr = run[0];
  //       for (let i = 0; i < substr.length - 1; i++) {
  //         cnTokens.push([substr.slice(i, i + 2), [index + i, index + i + 2]]);
  //       }
  //     }
  //   } else {
  //     for (const substr of lowerCase.match(reg) ?? []) {
  //       for (let i = 0; i < substr.length - 1; i++) {
  //         cnTokens.push(substr.slice(i, i + 2));
  //       }
  //     }
  //   }

  //   // 拼音转换
  //   const transform = (token: VT | VF, style: IPinyinStyle) => {
  //     const text = withRange ? token[0] : token as string;
  //     const py = pinyin(text, { style }).join("");
  //     return withRange ? [py, token[1]] : py;
  //   }
  //   const pinyinFull = cnTokens.map(token => transform(token, "normal"));
  //   const pinyinInit = cnTokens.map(token => transform(token, "first_letter"));

  //   return [...cnTokens, ...pinyinFull, ...pinyinInit] as V extends true ? VT[] : VF[];
  // }

  /** 防抖包装：`wait` 毫秒内重复调用只执行最后一次 */
  static debounce = <T extends (...args: never[]) => void>(func: T, wait: number) => {
    let timeout: ReturnType<typeof setTimeout>;
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(this, args);
      }, wait);
    };
  };

  /** 节流包装：`wait` 毫秒内最多执行一次 */
  static throttle = <T extends (...args: never[]) => void>(func: T, wait: number) => {
    let lastTime = 0;
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
      const now = Date.now();
      if (now - lastTime >= wait) {
        func.apply(this, args);
        lastTime = now;
      }
    };
  };

  /** 基于 `requestAnimationFrame` 的节流：每帧最多执行一次 */
  static animationThrottle = <T extends (...args: never[]) => void>(func: T, priority = 0) => {
    let isTicking = false;
    return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
      if (!isTicking) {
        AnimationFrameScheduler.add(() => {
          func.apply(this, args);
          isTicking = false;
        }, priority);
        isTicking = true;
      }
    };
  };

  /**
   * 向指定文档的 head 注入 `<style>`，可用 `id` 去重。
   *
   * @param value 要注入的 CSS 文本。
   * @param id 样式标签的 id；若该 id 已存在则跳过注入。
   * @param doc 目标文档（默认当前 document，如编辑器 iframe 可传其 `document`）。
   */
  static addStyle(value: string, id = "", doc = document) {
    if (id && doc.getElementById(id)) return;
    const style = $('<style type="text/css">').appendTo($("head", doc)).html(value);
    if (id) style.attr("id", id);
  }

  /**
   * 向指定位置注入 `<script>`（内联 `content` 或外部 `src`），不等待加载结果。
   *
   * @param loc 挂载 `<script>` 的宿主元素。
   * @param content 内联脚本内容（与 `src` 二选一）。
   * @param src 外部脚本地址（与 `content` 二选一，以 async 方式加载）。
   * @param type 脚本类型（默认 `"text/JavaScript"`）。
   */
  static addScript(loc: HTMLElement, content: string | null, src?: string, type?: string) {
    const script = document.createElement("script");
    script.type = type ? type : "text/JavaScript";
    if (content) script.innerHTML = content;
    else if (src) {
      script.src = src;
      script.async = true;
    }
    loc.appendChild(script);
  }

  /**
   * 按 `src` 或内联 `content` 加载脚本，返回加载完成/失败的 Promise，可用 `id` 去重。
   *
   * @param loc 挂载 `<script>` 的宿主元素。
   * @param content 内联脚本内容（与 `src` 二选一）。
   * @param src 外部脚本地址（与 `content` 二选一）。
   * @param type 脚本类型（默认 `"text/JavaScript"`）。
   * @param id 标签 id；若目标文档中已存在该 id 则直接 resolve。
   * @param timeout 超时毫秒数；默认不限制，失败或超时会移除脚本标签。
   */
  static loadScript(
    loc: HTMLElement,
    content?: string | null,
    src?: string | null,
    type?: string | null,
    id?: string,
    timeout = 0,
  ) {
    if (id && loc.ownerDocument.getElementById(id)) {
      return new Promise<void>((resolve) => {
        resolve();
      });
    }
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.type = type ? type : "text/JavaScript";
      if (id) script.id = id;
      if (src) script.src = src;
      if (content) script.innerHTML = content;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          reject(error);
        } else {
          resolve();
        }
      };
      script.onload = () => finish();
      script.onerror = () => finish(new Error(`脚本加载失败：${src ?? id ?? "内联脚本"}`));
      if (timeout > 0) {
        timer = setTimeout(() => finish(new Error(`脚本加载超时：${src}`)), timeout);
      }
      loc.appendChild(script);
    });
  }

  /** 获取 UTC-8 时区下 0 点的毫秒时间戳，`num` 为相对天数偏移（正数向后，负数向前） */
  static getStartTime(d: number | Date, num = 1) {
    const time = typeof d === "number" ? d : d.getTime();
    // UTC-8 为固定偏移（无夏令时），先将时间平移到 UTC-8 的本地坐标再按整天取整
    const offset = 8 * 60 * 60 * 1000;
    const day = 24 * 60 * 60 * 1000;
    return Math.floor((time + offset) / day) * day - offset + day * num;
  }

  /** 格式化为 `YYYY-M-D` 日期字符串 */
  static getFormattedDate(date = new Date()) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  /** 格式化为 `YYYY年M月D日` 中文日期字符串 */
  static getFormattedChineseDate(date = new Date()) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  /** 格式化为 `HH:MM:SS` 24 小时制时间字符串 */
  static getFormatted24hTime(date = new Date()) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
  }

  /** 格式化为 `YYYY-M-D HH:MM:SS` 日期时间字符串 */
  static getFormattedDateTime(date = new Date()) {
    return `${this.getFormattedDate(date)} ${this.getFormatted24hTime(date)}`;
  }

  /** 将字节数格式化为 B/KiB/MiB/GiB，保留两位小数 */
  static getFormattedSize = (size: number | string) => {
    size = Number(size) || 0;
    const f = (e: number) => Utils.getPrecisionFormatter().format(e);
    if (size < 1024) return f(size) + " B";
    else if (size < 1048576) return f(size / 1024) + " KiB";
    else if (size < 1073741824) return f(size / 1048576) + " MiB";
    else return f(size / 1073741824) + " GiB";
  };

  /**
   * 计算并记录本次请求的调度时间戳（按 `minimumRequestInterval` 限速；队列过长时返回 null）
   *
   * @returns 排定的发包时刻；返回 null 表示队列已超出上限，本次请求**不应**被发出，
   *   调用方必须据此放弃派发（见 {@link createRequest}）。
   */
  updateRequestTime() {
    const minimumRequestInterval = Math.max(
      this.configs.getSettings("minimumRequestInterval")!,
      500,
    );
    const now = Date.now();
    if (!Utils.requestCursorLoaded) {
      Utils.requestCursorLoaded = true;
      // 新键优先；旧版游标存在 settings 里，只读一次作为迁移回退
      const stored = Number(GM_getValue("mcmodderRequestCursor", 0)) || 0;
      const legacy = Number(this.configs.getSettings("lastRequestTime")) || 0;
      Utils.requestCursor = stored || legacy || now;
      // 跨标签页只同步这个小键，不再回灌整份设置
      GM_addValueChangeListener("mcmodderRequestCursor", (_key, _oldValue, value) => {
        const next = Number(value) || 0;
        if (next > Utils.requestCursor) Utils.requestCursor = next;
      });
    }
    let lastRequestTime = Utils.requestCursor || now;
    // 持久化的游标可能因旧版本数据、云端同步覆盖等而异常领先当前时间；此时照着它排期会把
    // 整条发包队列堵死，故直接丢弃、以当前时间重新起算
    if (lastRequestTime > now + minimumRequestInterval * Values.REQUEST_SCHEDULE_MAX_DRIFT_FACTOR) {
      console.warn("已排定时刻异常领先当前时间，发包排期将重新起算。");
      lastRequestTime = now;
    }
    if (lastRequestTime > now + minimumRequestInterval * Values.MAX_REQUEST_COUNT) {
      console.warn("已入队的请求数量超限，新的请求被忽略。");
      return null;
    }
    if (now > lastRequestTime) lastRequestTime = now;
    Utils.requestCursor = lastRequestTime + minimumRequestInterval;
    // 只写独立的游标键，避免每次请求都改写整份设置、覆盖其他标签页刚改的配置
    GM_setValue("mcmodderRequestCursor", Utils.requestCursor);
    return lastRequestTime;
  }

  /**
   * 发送限速请求的全局入口：
   * 按 `updateRequestTime` 排定延迟后发出，记录日志；遇到 `yxd_token` 校验响应时写入 cookie 并自动重发。
   *
   * 允许同时传入本次请求的用途说明（`message`），会随请求日志一并保存，便于排查请求目的。
   * 原则上所有网络请求都应当有附加信息，便于在监控中理解请求目的。
   *
   * @warning 队列超出 {@link Values.MAX_REQUEST_COUNT} 上限时，本请求直接以失败告终、**不会发包**
   *   （此前是把旧的队满哨兵值 `-1` 交给 `setTimeout`，负延迟被当作 0 处理，反而使限速彻底失效）。
   *   对本就无法降级重试的调用方而言失败与「不关心结果」无异；但计划任务与队列必须让失败
   *   可见地冒泡，否则会留下一条已排期、实则永远不会落地的待办。
   *
   * @param config 请求配置
   * @param message 本次请求的用途说明，会写入请求日志
   * @param silent 历史参数：旧版「网络请求监控」已移除，当前无实际效果；保留以兼容既有调用方
   * @param log 为 false 时不写请求日志；含认证 key 等敏感数据的内部请求应关闭
   */
  createRequest<R extends GmResponseType = "text">(
    config: GmXmlhttpRequestOption<R, unknown>,
    message?: string,
    silent = false,
    log = true,
    retry = false,
  ): Promise<GmResponseEvent<R, unknown>> {
    const lastRequestTime = this.updateRequestTime(),
      now = Date.now();
    if (lastRequestTime === null) {
      const errorMsg = "排队的请求已超出上限，本次请求被丢弃。";
      Utils.commonMsg(errorMsg + "（详见控制台）", false);
      return Promise.reject(new Error(errorMsg));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = (resp: GmResponseEvent<R, unknown>) => {
        if (settled) return;
        settled = true;
        resolve(resp);
      };
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        console.warn(`[MCModder-Lite] 请求失败：${reason}`, config.url);
        Utils.notifyRequestError(reason);
        reject(new Error(reason));
      };
      setTimeout(() => {
        config.onload = (resp) => {
          if (settled) return;
          // 二进制响应（`responseType: "arraybuffer"` 等）下 responseText 未必是字符串，不能直接 trim
          const str = typeof resp.responseText === "string" ? resp.responseText.trim() : "";
          const yxdTokenList =
            str.startsWith("<script>") && str.endsWith("</script>")
              ? str.match(/'yxd_token=[0-9a-f]+'/)
              : null;
          if (!yxdTokenList) {
            // 普通响应，或形如 <script> 但并非 token 校验：交回调用方
            succeed(resp);
            return;
          }
          // 未授予 cookie 权限（部分管理器 / Firefox）时无法写入 token，直接交回原响应
          if (typeof GM_cookie === "undefined" || typeof GM_cookie.set !== "function") {
            succeed(resp);
            return;
          }
          const url = new URL(resp.finalUrl);
          const hostname = url.hostname;
          // 只允许百科域：避免把 token 写到第三方（CurseForge / Modrinth）域
          if (hostname !== "mcmod.cn" && !hostname.endsWith(".mcmod.cn")) {
            console.warn(`[MCModder-Lite] 忽略非百科域的 yxd_token：${hostname}`);
            succeed(resp);
            return;
          }
          if (retry) {
            // 已重试过一次仍是 token 响应：交回调用方，避免无限递归
            succeed(resp);
            return;
          }
          const pathname = url.pathname;
          const index = pathname.lastIndexOf("/");
          const path = index > 0 ? pathname.slice(0, index) : "/";
          const yxdToken = yxdTokenList[0].slice(11, -1);
          GM_cookie.set(
            {
              name: "yxd_token",
              value: yxdToken,
              domain: hostname,
              path: path || "/",
              secure: true,
              // 站点以脚本形式下发 token，客户端是否读取尚未证实；
              // 暂不设 HttpOnly，避免破坏站点自身的 token 刷新（待实测后再收紧）
              httpOnly: false,
            },
            (err) => {
              if (err) {
                console.warn("Failed to set `yxd_token!`", err);
                // 写入失败也要交回响应，避免调用方永久挂起
                succeed(resp);
                return;
              }
              this.createRequest(config, message, silent, log, true).then(
                succeed,
                (error: unknown) => fail(error instanceof Error ? error.message : String(error)),
              );
            },
          );
        };
        config.onerror = () => fail("网络请求失败（请检查网络、代理或站点封禁）");
        config.ontimeout = () => fail("网络请求超时");
        config.onabort = () => fail("网络请求已取消");
        if (!config.timeout) config.timeout = 30000;
        if (log) {
          let content = `A${lastRequestTime}:${config.url}`;
          if (message) content += ` (${message})`;
          // 只记录请求体大小，绝不记录内容（可能含编辑正文 / 搜索词）
          if (config.data) {
            const bodySize = typeof config.data === "string" ? config.data.length : "non-string";
            content += ` [body:${bodySize}]`;
          }
          Utils.queueRequestLog(content);
        }
        // console.debug("Send Async request: ", config);
        GM_xmlhttpRequest(config);
      }, lastRequestTime - now);
    });
  }

  /** 清除正文中的百科格式化占位符（如 `[h1=]`） */
  static clearContextFormatter(e: string) {
    e = " " + e;
    const r = Values.ignoredContextFormatters;
    let m = true;
    while (m) {
      m = false;
      r.forEach(function (i) {
        const p = e.indexOf("[" + i);
        if (p > -1) {
          if (e.slice(p).indexOf("]") < 0) return;
          m = true;
          const s = e
            .slice(p)
            .split("]")[0]
            .replace("[" + i, "");
          if (i.indexOf("=") > -1) e = e.replace(e.slice(p).split("]")[0] + "]", s);
          /* else if (i === "icon:" && s.includes("=")) {
            s = s.split("=")[1].replace(",", "");
            e = e.replace(e.slice(p).split("]")[0] + "]", s);
          } */
          else e = e.replace(e.slice(p).split("]")[0] + "]", "");
        }
      });
    }
    return e.replace(" ", "");
  }

  /** 计算清除格式化占位符后正文的 UTF-8 字节长度 */
  static getContextLength(e: string) {
    const encoder = new TextEncoder();
    const r = Utils.clearContextFormatter(e);
    return encoder.encode(r).length;
  }

  /** 判断元素是否通过 `display: none` 隐藏 */
  static isNodeHidden(node: Element | JQuery) {
    if ($(node).css("display") === "none") return true;
    return false;
  }

  /** 净化文件名：将非法字符与空格替换为下划线，并截断到 255 字符 */
  static regulateFileName(name: string) {
    return name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/ /g, "_")
      .substring(0, 255);
  }

  /**
   * 为节点绑定点击复制到剪贴板的事件，复制成功后弹出提示。
   *
   * @param node 要绑定复制事件的节点（同时会加上 `mcmodder-copyable` 类）。
   * @param typeName 被复制内容的类型名，用于提示文案（如「物品名称」）。
   * @param copyData 要复制的内容；若不传则复制节点的 `textContent`。可传函数以在点击时惰性取值。
   */
  static addClickCopyEvent(
    node: JQuery,
    typeName: string,
    copyData?: string | number | (() => string | number),
  ) {
    node.addClass("mcmodder-copyable").click((e) => {
      const text =
        typeof copyData === "function" ? copyData() : copyData || e.currentTarget.textContent;
      navigator.clipboard.writeText(text.toString());
      Utils.commonMsg(`${typeName}已成功复制到剪贴板~ (${text})`);
    });
  }

  /** 同时更新「名称→ID」与「ID→名称」两个映射表 */
  updateClassNameIDMap(className: string, classID: string) {
    const classNameIDMap = this.configs.getAll("classNameIDMap") ?? {};
    const idClassNameMap = this.configs.getAll("idClassNameMap") ?? {};
    classNameIDMap[className] = classID;
    idClassNameMap[classID] = className;
    this.configs.setAll("classNameIDMap", classNameIDMap);
    this.configs.setAll("idClassNameMap", idClassNameMap);
  }

  /** 由模组 ID 查询其名称 */
  getClassNameByClassID(classID: string | number) {
    const idClassNameMap = this.configs.getAll("idClassNameMap") ?? {};
    return idClassNameMap[classID.toString()];
  }

  /** 由模组名称查询其 ID */
  getClassIDByClassName(className: string) {
    const classNameIDMap = this.configs.getAll("classNameIDMap") ?? {};
    return classNameIDMap[className];
  }

  /** 按模组 ID 与物品类型 ID/文本查找对应的物品类型数据 */
  getItemTypeData(classID: number | undefined, itemType: number | string | undefined) {
    const matchedTypeList = this.parent.itemTypeList?.filter(
      (entry) =>
        (entry.classID === classID || entry.classID === 0) &&
        ((entry.typeID || 1) === (itemType || 1) || entry.text === itemType),
    );
    return matchedTypeList?.length ? matchedTypeList[0] : undefined;
  }

  /** 生成物品类型的图标 HTML（按 `classID`+`itemType` 查找，或直接传入 `ItemType`） */
  getItemTypeHTML(
    ...args:
      [classID: number | undefined, itemType: number | undefined] | [itemType: ItemType | undefined]
  ) {
    let itemType;
    if (args.length === 1) {
      itemType = args[0];
    } else {
      itemType = this.getItemTypeData(args[0], args[1]);
    }
    if (!itemType) return $(`<i class="fa fa-question-circle-o text-danger"></i>`);
    const iconFont = $(`<span class="iconfont icon">`).css("color", itemType.color);
    if (itemType.classID === 0) iconFont.html(itemType.icon);
    else iconFont.html(`<i class="fa ${itemType.icon}"></i>`);
    return iconFont;
  }

  /** 刷新页面上所有 `data-toggle="tooltip"` 元素的 tooltip */
  static updateAllTooltip() {
    return $().tooltip
      ? $('[data-toggle="tooltip"]').tooltip({
          // animation: false,
          // delay: { show: 200 }
        })
      : null;
  }

  /** 按 ID 抓取物品资料页并解析为 `Item`，失败返回 undefined */
  async getItemByID(id: string | number) {
    id = Number(id);
    const resp = await this.createRequest(
      {
        url: `${this.parent.hostname}/item/${id}.html`,
        method: "GET",
        redirect: "manual",
        anonymous: true,
      },
      "获取物品基础信息",
    );
    if (resp.status > 300 || !resp.responseXML) {
      return;
    }
    const doc = $(resp.responseXML);
    return Utils.parseItemDocument(doc);
  }

  /** 按 ID 抓取物品编辑页并解析为 `Item`，未登录或失败返回 undefined */
  async getDetailedItemByID(id: string | number) {
    if (!this.parent.currentUID) return;
    id = Number(id);
    const resp = await this.createRequest(
      {
        url: `${this.parent.hostname}/item/edit/${id}/`,
        method: "GET",
        redirect: "manual",
      },
      "获取物品详细信息",
    );
    if (resp.status > 300 || !resp.responseXML) {
      return;
    }
    const doc = $(resp.responseXML);
    return Utils.parseItemEditorDocument(doc);
  }

  /** 从物品资料页 DOM 中解析物品信息为 `Item` */
  static parseItemDocument($doc: JQuery = $(document)) {
    const keywords = $doc.find("meta[name=keywords]").attr("content").split(",");
    const itemRow = $doc.find(".item-row").first();
    const command = itemRow.find(".item-give")?.attr("data-command")?.slice(9)?.split(" ");
    const righttable = itemRow.find(".righttable tbody > tr");
    const nav = $doc.find(".common-nav li");
    const classID = Utils.abstractIDFromURL(nav.eq(4).find("a").attr("href"), "class");
    const itemType = Number(
      nav.eq(6).find("a").attr("href").split(`/item/list/${classID}-`)[1].slice(0, -5),
    );
    const res: Item = {
      id: Utils.abstractIDFromURL(itemRow.find(".tool a").first().prop("href"), "item/edit"),
      classID: classID,
      name: keywords[0],
      englishName: keywords[1],
      itemType: itemType,
      smallIcon: "",
      largeIcon: "",
      creativeTabName: righttable.eq(3).find("a")?.text(),
      harvestTools: `[${Array.from(righttable.eq(5).find(".item-table-hover"))
        ?.map((e) => e.getAttribute("item-id"))
        .join(",")}]`,
    };
    if (command) {
      res.registerName = command[0];
      res.maxStackSize = Number(command[1]) || 1;
      if (command.length > 2) res.metadata = Number(command[2]) || 0;
    }
    Utils.deleteEmptyProperties(res);
    return res;
  }

  /** 从模组页 DOM 中解析模组信息，返回节点与 `classData` */
  static parseClassDocument($doc: JQuery = $(document)) {
    const name = $doc.find(".class-title h3");
    const ename = $doc.find(".class-title h4");
    const abbr = $doc.find(".class-title .short-name");
    return {
      nameNode: name,
      enameNode: ename,
      abbrNode: abbr,
      classData: {
        name: name.text(),
        englishName: ename.text(),
        abbr: abbr.text().slice(1, -1),
        cover: $doc.find(".class-cover-image img").attr("src"),
      } as Class,
    };
  }

  /** 将 `Item` 转换为物品编辑页提交所需的数据结构 */
  static async itemToEditorData(item: Item): Promise<McmodItemEditorData> {
    const res = { "item-data": {} } as DeepPartial<McmodItemEditorData>;
    const data = res["item-data"]! as Partial<McmodItemEditorInnerData>;
    if (item.id) {
      res["action"] = "item_edit";
      res["edit-id"] = item.id.toString();
    } else {
      res["action"] = "item_add";
    }
    res["class-id"] = item.classID.toString();

    data["content"] = item.content || "";
    data["name"] = item.name;
    if (item.englishName) data["ename"] = item.englishName;
    data["category"] = { 0: "1" };
    data["type"] = item.creativeTabName;
    data["icon-32x-data"] =
      item.smallIcon || Utils.appendBase64ImgPrefix(Utils.getImageURLByItemID(item.id, 32)) || "";
    data["icon-128x-data"] =
      item.largeIcon || Utils.appendBase64ImgPrefix(Utils.getImageURLByItemID(item.id, 128)) || "";
    data["is-general-node"] = "0";
    data["is-general-parents"] = "0";
    if (item.OredictList && item.OredictList.length <= 2)
      data["oredict"] = item.OredictList.slice(1, -1).replaceAll(", ", ",");
    if (item.maxStackSize != undefined) data["maxstack"] = item.maxStackSize.toString();
    // if (item.tools) data["tools"] = item.tools;

    return res as McmodItemEditorData;
  }

  /** 从物品编辑页 DOM 中解析完整物品信息为 `Item` */
  static parseItemEditorDocument($doc: JQuery = $(document)) {
    const headScript = $doc.find("head > script").last().html().split(";");
    const bodyScript = $doc.find("body > script").last().html();
    const inputs = $doc.find(".input-group");
    const nav = $doc.find(".common-nav li");
    const res: Item = {
      id: Utils.abstractIDFromURL(nav.eq(8).find("a").attr("href"), "item"),
      classID: Number(headScript[2].slice(16, -1)), // var nClassID = '1'
      creativeTabName: headScript[3].slice(23, -1), // var strItemTypeName = 'foo'
      smallIcon: Utils.appendBase64ImgPrefix(headScript[5]?.slice(7, -1)),
      largeIcon: Utils.appendBase64ImgPrefix(headScript[7]?.slice(7, -1)),
      name: inputs.find("[data-multi-id=name]").val(),
      englishName: inputs.find("[data-multi-id=ename]").val(),
      harvestTools: `[${bodyScript.split(");addItemTools(").slice(1).map(parseInt).join(",")}]`,
      OredictList: `[${inputs.find("[data-multi-id=oredict]").val()}]`,
      maxDurability: Number(inputs.find("[data-multi-id=damage]").val()),
      maxStackSize: Number(inputs.find("[data-multi-id=maxstack]").val()),
      registerName: inputs.find("[data-multi-id=regname]").val(),
      metadata: inputs.find("[data-multi-id=metadata]").val(),
    };
    Utils.deleteEmptyProperties(res);
    const generalAlert = $(".edit-user-alert.isgeneral");
    if (generalAlert.length)
      res.generalTo = Utils.abstractIDFromURL(generalAlert.find("a").attr("href"), "item");
    return res;
  }
}
