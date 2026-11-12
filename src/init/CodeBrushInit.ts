import { GM_getValue } from "$";

/**
 * 阅读面 / 预览面代码高亮扩展——**早于 main() 的叶子模块**（同 earlySplash 模式，
 * 在 bundle 求值期注入，不依赖 main() / InitLoader 的存活）。
 *
 * # 为什么不在 InitLoader 里跑（2026-11-12 真机取证）
 * - 「正文预览」是独立页（window.open → `/preview/`），其**服务端**把所有 pre 的
 *   brush 类名（含站点自带的 cb/java）统一改写为 `brush:none;` 后才返回（POST
 *   响应原文实证）。因此预览面对任何客户端刷子注册都结构性不敏感——素块是站点
 *   行为，不是本功能缺陷。预览的高亮由「预览桥」实现：编辑页在点击「正文预览」
 *   时把编辑器里 pre 的刷名序列经 GM 存储带给本页（`PreviewBrushCapture`），本页
 *   注入脚本按序把 none 容器重着色。
 * - 真机 /preview/ 保存件显示 bundle 样式已注入而 Init 循环的注入脚本缺席——
 *   Init 循环在该页的存活无保证；bundle 求值期代码（样式同款路径）实证可活。
 *   故注入上移到求值期。
 * - 早注入同时把阅读页注册从「迟到 + 缓存失效」升级为「定义钩子」（shCore 赋值
 *   时刻即注册，先于任何消费与缓存构建），消除全部时序竞态。
 *
 * # 依赖纪律
 * 求值早于一切应用代码：只允许 `$`（GM 别名）导入；宿主全局只读
 * `window.location`；DOM 注入不走 Utils（避免拖入非叶子依赖链）。
 *
 * # 站点机制（shCore v=2 / main.js v=50，真站实测）
 * - shCore.js / shBrush.js 为 head 同步脚本，`var SyntaxHighlighter=` 顶层声明；
 *   预置访问器（defineProperty set/get）不干扰 var 绑定创建，赋值必触发 setter。
 * - 阅读页批次挂在 window load；别名缓存惰性构建于首次 findBrush，别名按声明
 *   原样入键、查询零大小写归一——别名表自带大小写变体。
 * - 已发布正文 pre 是实体形态（空格=`&nbsp;`、换行=真实 `\n`、`<`/`&` 转义），
 *   刷子正则以 `(?:&nbsp;…|[ \t])` 双形态兼容。
 */
export function installCodeBrushEarly() {
  let enabled = true;
  try {
    const settings = JSON.parse(GM_getValue("mcmodderSettings") || "{}");
    enabled = settings.codeBrushLanguages !== false;
  } catch {
    // 读不到设置按默认开启处理（与面板注册的默认值一致）
  }
  if (!enabled) return;
  const href = window.location.href;
  if (!href.startsWith("https://www.mcmod.cn/") && !href.startsWith("https://www1.mcmod.cn/")) {
    return;
  }
  // 预览桥数据：编辑页点击「正文预览」时写入（PreviewBrushCapture）；仅 60s 内
  // 有效，且刷名必须过白名单（编辑器正文是用户内容，类名不可信）。
  let stash = "";
  try {
    const raw = GM_getValue("mcmodderPreviewBrushStash");
    if (raw) {
      const parsed = JSON.parse(String(raw)) as { t?: number; names?: unknown };
      if (Date.now() - (parsed.t ?? 0) < 60000 && Array.isArray(parsed.names)) {
        const names = (parsed.names as unknown[])
          .filter((n) => typeof n === "string" && /^[a-zA-Z]{1,20}$/.test(n))
          .slice(0, 50);
        if (names.length) stash = JSON.stringify(names);
      }
    }
  } catch {
    // 坏数据按无桥处理
  }
  const isPreview = href.includes("/preview/");
  const inject = () => {
    const loc = document.head ?? document.documentElement;
    if (!loc) return false;
    const script = document.createElement("script");
    script.type = "text/javascript";
    // 数据与等待标记必须拼在 BRUSH_SCRIPT **之前**：脚本的桥轮询以它们的存在
    // 为安装条件，拼在尾部时检查先于赋值执行，桥永远不会安装（真机踩过）。
    const prelude =
      (stash ? `window.__mcmodderPreviewBrushes=${stash};` : "") +
      (isPreview ? "window.__mcmodderBridgeWait=true;" : "");
    script.textContent = (prelude ? prelude + "\n" : "") + BRUSH_SCRIPT;
    loc.appendChild(script);
    console.log("[MCModder-Lite] 代码高亮扩展注入（页面上文，求值期）");
    return true;
  };
  if (inject()) {
    // /preview/ 页 GM 数据可能晚于本页启动才可见（真机 TM 跨标签存储提交延迟）：
    // 有界轮询，到位后补注数据脚本，页内桥轮询下一跳即取用
    if (isPreview && !stash) {
      let polls = 0;
      const stashTimer = setInterval(() => {
        polls++;
        try {
          const raw = GM_getValue("mcmodderPreviewBrushStash");
          if (raw) {
            const parsed = JSON.parse(String(raw)) as { t?: number; names?: unknown };
            if (Date.now() - (parsed.t ?? 0) < 60000 && Array.isArray(parsed.names)) {
              const lateNames = (parsed.names as unknown[])
                .filter((n) => typeof n === "string" && /^[a-zA-Z]{1,20}$/.test(n))
                .slice(0, 50);
              if (lateNames.length) {
                clearInterval(stashTimer);
                const script = document.createElement("script");
                script.type = "text/javascript";
                script.textContent = `window.__mcmodderPreviewBrushes=${JSON.stringify(lateNames)};`;
                (document.head ?? document.documentElement)?.appendChild(script);
              }
            }
          }
        } catch {
          // 轮询期读失败按未到处理
        }
        if (polls >= 40) clearInterval(stashTimer);
      }, 500);
    }
    return;
  }
  // 极早注入时 documentElement 理论上已存在，防御性有界轮询；
  // 仍失败则随 DOMContentLoaded 注入（阅读页批次在 window load，仍来得及注册）
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    if (inject() || tries >= 20) {
      clearInterval(timer);
      if (tries >= 20) {
        document.addEventListener("DOMContentLoaded", inject, { once: true });
      }
    }
  }, 20);
}

/**
 * 页面上文执行的注册脚本。要点：
 * - 内容里不得出现反引号与 `${`（String.raw 承载的硬约束）；TS 模板字符串
 *   正则经 String.fromCharCode(96) 构造。
 * - 着色类只用 shCore.css 实际存在的：string / comments / color1 / color2 /
 *   value / functions / keyword（无 constant 类）。
 * - 尾部可选携带预览桥数据（`__mcmodderPreviewBrushes`，白名单过滤后的刷名
 *   数组），仅 /preview/ 页会有。
 */
const BRUSH_SCRIPT = String.raw`
(function () {
  if (window.__mcmodderCodeBrush) return;
  window.__mcmodderCodeBrush = true;
  var TAG = "[MCModder-Lite][CodeBrush]";
  var WS = "(?:&(?:nbsp|#160|#xa0|#xA0);|[ \t])";
  var OUR_LANG = /brush\s*:\s*(yaml|yml|toml|ts|typescript)\b/i;
  var F96 = String.fromCharCode(96);

  window.__mcmodderMakeBrushes = function (S) {
    var HL = S.Highlighter, RX = S.regexLib;
    function Yaml() {
      this.regexList = [
        { regex: /(?:"|&quot;)(?:\\.|[^\\"\n]|&(?!quot;))*(?:"|&quot;)/g, css: "string" },
        { regex: /(?:'|&#39;)(?:\\.|[^\\'\n]|&(?!#39;|apos;))*(?:'|&#39;)/g, css: "string" },
        { regex: new RegExp("(?:^|" + WS + ")#[^\\n]*", "gm"), css: "comments" },
        { regex: new RegExp("^(?:" + WS + ")*(?:-(?:" + WS + ")*)*[\\w.$\u4e00-\u9fa5-]+(?=:(?!//))", "gm"), css: "color2" },
        { regex: /\b(?:true|false|yes|no|on|off|null)\b/gi, css: "value" },
        { regex: /\b\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?\b/g, css: "value" },
        { regex: /\b\d[\d_]*(?:\.\d+)?\b/g, css: "value" },
        { regex: /!!?[\w-]+/g, css: "color1" }
      ];
    }
    function Toml() {
      this.regexList = [
        { regex: /(?:"|&quot;)(?:\\.|[^\\"\n]|&(?!quot;))*(?:"|&quot;)/g, css: "string" },
        { regex: /(?:'|&#39;)(?:\\.|[^\\'\n]|&(?!#39;|apos;))*(?:'|&#39;)/g, css: "string" },
        { regex: new RegExp("(?:^|" + WS + ")#[^\\n]*", "gm"), css: "comments" },
        { regex: new RegExp("^(?:" + WS + ")*\\[\\[?[^\\]\\n]+\\]\\]?", "gm"), css: "color1" },
        { regex: new RegExp("^(?:" + WS + ")*[\\w.$\"-]+(?=" + WS + "*=)", "gm"), css: "color2" },
        { regex: /\b(?:true|false)\b/g, css: "value" },
        { regex: /\b\d{4}-\d{2}-\d{2}(?:[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)?\b/g, css: "value" },
        { regex: /\b\d[\d_]*(?:\.\d+)?\b/g, css: "value" }
      ];
    }
    function Ts() {
      this.regexList = [
        { regex: RX.multiLineCComments, css: "comments" },
        { regex: RX.singleLineCComments, css: "comments" },
        { regex: /(?:"|&quot;)(?:\\.|[^\\"\n]|&(?!quot;))*(?:"|&quot;)/g, css: "string" },
        { regex: /(?:'|&#39;)(?:\\.|[^\\'\n]|&(?!#39;|apos;))*(?:'|&#39;)/g, css: "string" },
        { regex: new RegExp(F96 + "(?:\\\\.|[^\\\\\u0060])*" + F96, "g"), css: "string" },
        { regex: /\b(?:abstract|any|as|async|await|break|case|catch|class|const|continue|debugger|declare|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|namespace|never|new|null|number|of|private|protected|public|readonly|return|set|static|string|super|switch|symbol|this|throw|true|try|type|typeof|undefined|union|unknown|var|void|while|yield)\b/g, css: "keyword" },
        { regex: new RegExp("\\b[A-Za-z_$][\\w$]*(?=(?:" + WS + "|\n)*\\()", "g"), css: "functions" },
        { regex: /\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, css: "value" }
      ];
    }
    Yaml.prototype = new HL();
    Yaml.aliases = ["yaml", "YAML", "Yaml", "yml", "YML", "Yml"];
    Toml.prototype = new HL();
    Toml.aliases = ["toml", "TOML", "Toml"];
    Ts.prototype = new HL();
    Ts.aliases = ["ts", "TS", "Ts", "typescript", "TypeScript", "TYPESCRIPT"];
    return { Yaml: Yaml, Toml: Toml, Ts: Ts };
  };

  var registered = false;
  function register(S, late) {
    try {
      if (!S || !S.brushes || !S.Highlighter) return false;
      var B = window.__mcmodderMakeBrushes(S);
      for (var k in B) S.brushes[k] = B[k];
      if (late && S.vars && "discoveredBrushes" in S.vars) S.vars.discoveredBrushes = null;
      registered = true;
      console.log(TAG, "刷子注册完成：Yaml / Toml / Ts" + (late ? "（迟到注册，别名缓存已失效）" : "（定义钩子）"));
      return true;
    } catch (e) {
      console.warn(TAG, "刷子注册失败：", e);
      return false;
    }
  }

  function catchUp(S) {
    try {
      var pres = document.querySelectorAll("pre[class*='brush']");
      var n = 0;
      for (var i = 0; i < pres.length; i++) {
        if (!OUR_LANG.test(String(pres[i].className || ""))) continue;
        S.highlight(null, pres[i]);
        n++;
      }
      if (n) console.log(TAG, "追补高亮 " + n + " 个代码块");
    } catch (e) {
      console.warn(TAG, "追补失败：", e);
    }
  }

  var existing = window.SyntaxHighlighter;
  if (existing && register(existing, true)) {
    // 注入晚于 shCore（页面已加载完的罕见路径）
  } else if (!existing) {
    try {
      var hooked;
      Object.defineProperty(window, "SyntaxHighlighter", {
        configurable: true,
        get: function () {
          return hooked;
        },
        set: function (v) {
          hooked = v;
          register(v, false);
        }
      });
    } catch (e) {
      console.warn(TAG, "定义钩子安装失败：", e);
    }
  }

  // —— 预览桥（/preview/ 页专用）：服务端把全部 pre 的 brush 类改写为 none，
  // 原始刷名由编辑页点击「正文预览」时经 GM 存储带来。按文档序把 none 容器
  // 重着色；数量不匹配、名字不在注册表或无数据则不动。未知刷名（不在别名
  // 缓存里）单格跳过，保持素块。
  function recolorPreview(names) {
    try {
      if (!Array.isArray(names) || !names.length) return;
      var S = window.SyntaxHighlighter;
      if (!S || !S.brushes) return;
      var containers = document.querySelectorAll(".syntaxhighlighter");
      if (!containers.length || containers.length !== names.length) {
        console.warn(TAG, "预览桥条数不匹配，放弃重着色", containers.length, names.length);
        return;
      }
      var n = 0;
      for (var i = 0; i < containers.length; i++) {
        var name = names[i];
        var known = S.vars && S.vars.discoveredBrushes && S.vars.discoveredBrushes[name];
        var container = containers[i];
        var codeDiv = container.querySelector(".code .container");
        if (!known || !codeDiv) continue;
        var lines = codeDiv.querySelectorAll(".line");
        var text = [];
        for (var j = 0; j < lines.length; j++) text.push(lines[j].textContent || "");
        var pre = document.createElement("pre");
        pre.className = "brush:" + name;
        pre.textContent = text.join("\n");
        container.parentNode.replaceChild(pre, container);
        S.highlight(null, pre);
        n++;
      }
      if (n) console.log(TAG, "预览桥重着色 " + n + " 个代码块");
    } catch (e) {
      console.warn(TAG, "预览桥失败：", e);
    }
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      var cur = window.SyntaxHighlighter;
      if (!cur) {
        console.warn(TAG, "本页没有 SyntaxHighlighter（站点未加载高亮引擎），跳过");
        return;
      }
      if (!registered && !register(cur, true)) return;
      // 让站点自己的 load 批次先行：150ms 后只捡剩下来的裸块（幂等）
      setTimeout(function () {
        catchUp(cur);
      }, 150);
    }, 0);
  });

  if (document.readyState === "complete") {
    setTimeout(function () {
      var cur = window.SyntaxHighlighter;
      if (cur && register(cur, true)) catchUp(cur);
    }, 0);
  }

  if (window.__mcmodderBridgeWait) {
    // /preview/ 页：数据可能已在（拼在脚本前）也可能迟到（GM 跨标签提交延迟，
    // 沙箱轮询补注数据脚本）；容器由页面自身解析期脚本生成——**两者都就位**
    // 才重着色，只看数据不看容器会把「尚未渲染」误判为「条数不匹配」而永久放弃
    var bridgeTries = 0;
    var bridgeTimer = setInterval(function () {
      bridgeTries++;
      var names = window.__mcmodderPreviewBrushes;
      var containers = document.querySelectorAll(".syntaxhighlighter");
      if (Array.isArray(names) && names.length && containers.length) {
        clearInterval(bridgeTimer);
        recolorPreview(names);
      } else if (bridgeTries >= 40) {
        clearInterval(bridgeTimer);
      }
    }, 500);
  }
})();
`;
