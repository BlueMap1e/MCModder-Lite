import { AnimationFrameScheduler } from "./AnimationFrameScheduler";
import { Values } from "./Values";

export interface ThemeColorSet {
  tc1: string;
  tc2: string;
}

/**
 * 全局工具类：只承载不依赖任何上下文的静态纯函数（DOM 操作、格式化、色彩换算、URL
 * 处理、键位判定等）。不持有实例状态（仅进程级 UA 缓存），禁止实例化或注入 `Mcmodder`
 * 引用——需要配置 / GM 存储的辅助方法归 `ConfigRepository`，需要发请求的归
 * `WebFetchUtils`（`Mcmodder.web`）。
 */
/**
 * # 分区目录
 *
 * 文件按域分段，分段标记为 `// ─── … ───`，编辑器搜索 ─── 可逐区跳转；行号为撰写时
 * 快照，仅作位置感参考，定位请以下列方法名为锚。
 *
 * - 环境与登录（~45）：isMac / isMobileClient / toQzoneLogin
 * - 消息与弹窗（~70）：commonMsg / createModal
 * - 通用判定（~115）：clamp / versionCompare / validateVersion* / simpleDeepCopy /
 *   isEditableTarget / has*Access 等基础判定
 * - 格式化与名称解析（~250-430）：rgbToHex / getFormattedTime|Number / 类名与物品名
 *   构造解析 / blob2Base64 族
 * - URL 构造与锚点（~430-540）：highlight / abstract*FromURL / get*URL / URLToAnchor /
 *   textToAnchor
 * - 色彩空间换算（~540-750）：colorToRGB / RGBToHSL / HSLToRGB / set* 系列
 * - 键位处理（~750-850）：键组合 / keyToString / keyToHTML / isKeyMatch
 * - 转义与 URL 白名单（~850-910）：randStr / escapeHTML / safeURL
 * - linkify 与 DOM 注入（~910-1050）：linkifyTextNodes / debounce / throttle /
 *   animationThrottle / addStyle / addScript
 * - 日期时间与杂项（~1050-尾）：getStartTime / getFormattedDate|Size /
 *   clearContextFormatter / addClickCopyEvent / updateAllTooltip / parseClassDocument
 */
export class Utils {
  private static m_isMac: boolean | undefined;
  /** 判断当前是否为 macOS（结果缓存，避免重复读取 UA） */
  // ─── 环境与登录 ───
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
  // ─── 消息与弹窗 ───
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
    void swal.fire(option).then(() => {
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

  // ─── 通用判定：数值 / 版本 / 对象 / DOM / 权限 ───
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

  /** 将形如 `rgb(r,g,b)` 的字符串转换为 `#rrggbb` */
  // ─── 格式化与名称解析（含 Base64 互转）───
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
  // ─── URL 构造与锚点 ───
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

  /** 生成新窗口打开的目标 `<a>` 元素，文本缺省为 URL 本身；URL 过白名单，不合规格返回空集 */
  static URLToAnchor(url: string, text?: string) {
    const safe = Utils.safeURL(url);
    if (!safe) return $();
    return $("<a>")
      .attr({
        target: "_blank",
        href: safe,
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
  // ─── 色彩空间换算 ───
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
  // ─── 键位处理 ───
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

  /** 生成指定长度的随机字符串（字母数字+下划线） */
  // ─── 转义与 URL 白名单 ───
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

  /**
   * 把元素**文本节点**里的 URL 就地转成 `<a>`，不改动任何标签与属性。
   *
   * 与「先取 `.html()` 再字符串替换」相比，这条路径不会把用户文本重新解析成 HTML，
   * 也不会误改已有标签的属性，是处理短评 / 附言这类外部内容的唯一安全做法。
   *
   * @returns 转换出的链接数量
   */
  // ─── linkify / 防抖节流 / DOM 注入 ───
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

  /** 获取 UTC-8 时区下 0 点的毫秒时间戳，`num` 为相对天数偏移（正数向后，负数向前） */
  // ─── 日期时间与杂项 ───
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

  /** 站点显示的时间不带时区，固定按 UTC+8 解析，避免脚本在其它时区运行时倒计时整体偏移 */
  static parseUTC8Time(text: string | null) {
    const match = text?.matchAll(/\d+/g);
    if (!match) return Date.parse(text ?? "");
    const [year, month, day, hour, minute, second] = match;
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - 8 * 60 * 60 * 1000;
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
      void navigator.clipboard.writeText(text.toString());
      Utils.commonMsg(`${typeName}已成功复制到剪贴板~ (${text})`);
    });
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
}
