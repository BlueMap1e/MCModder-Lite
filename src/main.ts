// 必须放在所有其它 import 之前：ESM 的依赖会先于本模块体求值，
// 这里要赶在 Values 的静态初始化（会读 GM_info）之前完成 dev 期自检。
// earlySplash 必须最先求值（早于 devCheck 与整包依赖），把防闪烁遮罩落在第一毫秒
import { nightMode, splashStyle } from "./earlySplash";
import "./devCheck";
import { GM_getValue, GM_addValueChangeListener } from "$";
import { Mcmodder } from "./Mcmodder";
import bbsCss from "./css/bbs.css?raw";
import { installCodeBrushEarly } from "./init/CodeBrushInit";

(() => {
  // 代码高亮扩展（YAML/TOML/TS）：必须在求值期注入——/preview/ 等页面的自身
  // 消费脚本早于 DOMContentLoaded 跑，且真机上 Init 循环在该类页面的存活无保证
  //（见 CodeBrushInit 顶部取证注释）。设置自读，早于一切 jQuery 等待。
  installCodeBrushEarly();
  // 兜底记录未捕获异常，便于用户反馈时定位；不改变任何行为
  window.addEventListener("error", (event) => {
    if (event.error) console.error("[MCModder-Lite] 未捕获异常：", event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[MCModder-Lite] 未处理的 Promise 异常：", event.reason);
  });
  const initBbsDarkMode = () => {
    let settings: any = {};
    try {
      settings = JSON.parse(GM_getValue("mcmodderSettings") || "{}");
    } catch (e) {}
    if (!settings.bbsNightMode) {
      clearScreenCover();
      return;
    }
    // 夜间模式偏好（0 跟随系统 / 1 日间 / 2 夜间）。旧版仅有 adaptableNightMode 布尔开关，
    // 迁移发生前（首次访问 mcmod.cn 主站之前）的存储按旧语义解读，只读不改，
    // 真正的键值迁移由主站页面的 Mcmodder.main() 完成。
    const resolvePreference = (cfg: any) =>
      cfg.nightModePreference ?? (cfg.adaptableNightMode === false ? (cfg.nightMode ? 2 : 1) : 0);
    const updateClass = (cfg: any) => {
      const preference = resolvePreference(cfg);
      const isNight =
        preference === 2 ||
        (preference === 0 && window.matchMedia("(prefers-color-scheme: dark)").matches);
      if (isNight) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      // 夜↔日切换（含跨标签页）时编辑器 iframe 的注入样式要跟着翻面；
      // MutationObserver 只监听 childList，类变化不会触发，须在此重同步
      syncEditorIframes();
    };
    // Discuz 高级发帖的富文本编辑器在 iframe（#e_iframe）里，父页样式进不去，
    // 需要往它的 contentDocument 注入夜间配色。色值须与 bbs.css 的
    // --mcmodder-color-background-dark2 / --mcmodder-color-text 保持一致。
    // 编辑器文档可能在首秒之后才就绪（此前用 documentElement 上的标记会把
    // about:blank 空文档误判为已处理），故以注入的 style 元素为幂等标记，
    // 并随 cleanBbsElements（观察者回调）反复重试。
    // 仅夜间注入；日间反向幂等——移除已注入样式（否则日间编辑器残留深色底）。
    const syncEditorIframes = () => {
      const isNight = document.documentElement.classList.contains("dark");
      document.querySelectorAll("iframe#e_iframe").forEach((frame) => {
        const el = frame as HTMLIFrameElement;
        // 编辑器切换富文本/源码模式会整文档重建 iframe 内容，load 事件逐次重试；
        // 绑定标记挂在 iframe 元素上（元素本身跨文档重建存续）
        if (el.dataset.mcmodderSync !== "1") {
          el.dataset.mcmodderSync = "1";
          el.addEventListener("load", () => syncEditorIframes());
        }
        const doc = el.contentDocument;
        if (!doc?.body) return;
        const existing = doc.getElementById("mcmodder-bbs-editor-dark");
        if (!isNight) {
          if (existing) existing.remove();
          return;
        }
        if (existing) return;
        const style = doc.createElement("style");
        style.id = "mcmodder-bbs-editor-dark";
        style.textContent =
          "body { background-color: #242424 !important; color: #e2e8f0 !important; }";
        (doc.head ?? doc.documentElement).appendChild(style);
      });
    };
    updateClass(settings);
    GM_addValueChangeListener(
      "mcmodderSettings",
      (_key: string, _oldValue?: string, newValue?: string) => {
        try {
          const newSettings = JSON.parse(newValue || "{}");
          updateClass(newSettings);
        } catch (e) {}
      },
    );
    // 跟随系统偏好时系统深浅色变化需要即时反映；手动偏好下 matchMedia 结果不参与判定，
    // 回调重算一次是无害的空操作，故不再按偏好分支注册
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      try {
        const currentSettings = JSON.parse(GM_getValue("mcmodderSettings") || "{}");
        updateClass(currentSettings);
      } catch (e) {}
    });
    const style = document.createElement("style");
    style.textContent = bbsCss;
    document.documentElement.appendChild(style);
    const moveStyleToBottom = () => {
      if (document.head) {
        document.head.appendChild(style);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", moveStyleToBottom, {
        once: true,
      });
    } else {
      moveStyleToBottom();
    }
    const cleanInlineStyles = () => {
      const mn = document.querySelector(".yudilistl .mn");
      if (mn) {
        (mn as HTMLElement).style.background = "";
      }
      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          const sheet = document.styleSheets[i];
          try {
            const rules = sheet.cssRules || sheet.rules;
            if (!rules) continue;
            for (let j = 0; j < rules.length; j++) {
              const rule = rules[j] as CSSStyleRule;
              if (
                rule.selectorText &&
                (rule.selectorText.includes(".ts") || rule.selectorText.includes("separatorline"))
              ) {
                if (
                  rule.style.getPropertyPriority("background") === "important" ||
                  rule.style.getPropertyPriority("background-color") === "important"
                ) {
                  rule.style.removeProperty("background");
                  rule.style.removeProperty("background-color");
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
      const cleanBbsElements = () => {
        syncEditorIframes();
        const els = document.querySelectorAll(
          ".tl .ts th, .tl .ts td, #separatorline th, #separatorline td",
        );
        els.forEach((el) => {
          (el as HTMLElement).style.setProperty(
            "background",
            "var(--mcmodder-color-background-dark1)",
            "important",
          );
        });
        document
          .querySelectorAll(
            'tr[style*="background"], td[style*="background"], div[style*="background"], span[style*="background"], table[style*="background"]',
          )
          .forEach((el) => {
            const bg =
              (el as HTMLElement).style.background || (el as HTMLElement).style.backgroundColor;
            if (
              bg &&
              (bg.includes("#fff") ||
                bg.includes("rgb(255, 255, 255)") ||
                bg.includes("#FFF") ||
                bg.includes("FFFFFF") ||
                bg.includes("255,255,255"))
            ) {
              (el as HTMLElement).style.background = "";
              (el as HTMLElement).style.backgroundColor = "";
            }
          });
      };
      // Discuz 高级发帖的富文本编辑器在 iframe（#e_iframe）里：注入/移除夜间配色
      // 由 initBbsDarkMode 作用域上的 syncEditorIframes 统一处理（夜间感知、双向幂等）
      cleanBbsElements();
      setTimeout(cleanBbsElements, 100);
      setTimeout(cleanBbsElements, 500);
      setTimeout(cleanBbsElements, 1000);
      const observer = new MutationObserver(cleanBbsElements);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", cleanInlineStyles, {
        once: true,
      });
    } else {
      cleanInlineStyles();
    }
    clearScreenCover();
  };
  const clearScreenCover = () => {
    splashStyle.textContent = `body { animation: mcmodder-fadein .3s ease forwards; } @keyframes mcmodder-fadein { from { opacity: 0; } to { opacity: 1; } }`;
    setTimeout(() => splashStyle.remove(), 300);
  };
  const init = () => {
    if (window.location.hostname === "bbs.mcmod.cn") {
      initBbsDarkMode();
    } else if (typeof jQuery === "undefined" && document.body != null) {
      // 已被封禁
      if ((document.body.textContent ?? "").includes("您已被系统封禁")) {
        document.body.innerHTML +=
          '若遇封IP，请在向作者反馈时发送下列内容，并告知具体封禁时间（精确到秒）以及被封禁时已打开的百科页面数量。下列内容可能包含敏感信息，可考虑私信发送。<textarea id="mcmodder-log-export" style="min-height: 800px; min-width: 100%;">';
        (document.getElementById("mcmodder-log-export") as HTMLTextAreaElement).value =
          GM_getValue("mcmodderSettings") +
          "\n" +
          GM_getValue("scheduleRequestList") +
          "\n" +
          GM_getValue("mcmodderLogger");
      }
      // 后台跳转到登录
      else if (
        window.location.href.startsWith("https://admin.mcmod.cn/") &&
        document.body.innerHTML === '{"state":107}'
      ) {
        document.body.innerHTML += `
          <br><a target="_blank" href="https://www.mcmod.cn/login/">登录 (主网址)</a>
          <br><a target="_blank" href="https://www1.mcmod.cn/login/">登录 (备用网址)</a>
        `;
      }
      splashStyle.textContent = `body { animation: mcmodder-fadein .3s ease forwards; } @keyframes mcmodder-fadein { from { opacity: 0; } to { opacity: 1; } }`;
      setTimeout(() => splashStyle.remove(), 300);
    } else {
      void (async () => {
        new Mcmodder();
      })().catch((error) => {
        console.error("Mcmodder 启动失败：", error);
        clearScreenCover();
      });
    }
  };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    try {
      init();
    } catch (error) {
      console.error("Mcmodder 启动失败：", error);
      clearScreenCover();
    }
  };
  // 兜底：初始化异常或日间模式下 jQuery 迟到超过 4 秒时撤掉遮罩。
  // 日间揭示无闪可防（白底本就是日间外观）；夜间用户不揭示——宁可多等深色
  // 遮罩（旧行为），也不把站点尚未主题化的浅色渲染提前曝光（白闪）。
  // 不伪启动 init()：jQuery 未就绪时会被误判进封禁页分支，把遮罩连同 html
  // 深底一起拆掉，且 started 标记会阻塞 load 后真正的初始化。
  // 「脚本晚注入」场景由 tryInit 的 readyState === "complete" 分支覆盖。
  // 已知代价：夜间 + jQuery 永久卡死时深色遮罩会一直停留（旧行为，重载即可）。
  // 若要夜间也提前揭示，需把调色盘生成提前到无 jQuery 的 document-start
  // （early-dark 骨架），属独立重构。
  window.setTimeout(() => {
    if (started) {
      clearScreenCover();
    } else if (!nightMode) {
      splashStyle.remove();
    }
  }, 4000);
  const tryInit = () => {
    if (window.location.hostname === "bbs.mcmod.cn") {
      start();
    } else if (typeof jQuery !== "undefined") {
      start();
    } else if (document.readyState === "complete") {
      // load 已经发生过，再挂监听永远不会触发
      start();
    } else {
      window.addEventListener("load", () => start(), { once: true });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInit, { once: true });
  } else {
    tryInit();
  }
})();
