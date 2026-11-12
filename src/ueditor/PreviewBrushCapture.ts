import { GM_setValue } from "$";
import type { Mcmodder } from "../Mcmodder";

/**
 * 预览桥·编辑侧：点击「正文预览」时，把编辑器正文里 pre 的刷名按文档序
 * 存入 GM 存储（60s 时效），供 /preview/ 页的预览桥重着色使用——预览页的
 * 服务端会把全部 brush 类名改写为 `brush:none;`（连站点自带刷子也是素块），
 * 原始刷名只有编辑侧知道，必须由此带过去。
 *
 * 监听是文档级捕获（先于站点自身的按钮处理器），但只在编辑页挂载，且回调
 * 按「closest a + 按钮文案」过滤，非目标点击零成本返回。
 */
export function installPreviewBrushCapture(parent: Mcmodder) {
  if (parent.configRepository.getSettings("codeBrushLanguages") === false) return;
  if (!(parent.href.startsWith(parent.hostname) && parent.href.includes("/edit/"))) return;
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor || !anchor.textContent?.includes("正文预览")) return;
      try {
        const u = parent.ueditorFrame[parent.ueditorFrame.length - 1];
        const bodyEl = u?.$body?.get(0) ?? u?.body;
        if (!bodyEl) return;
        const names: string[] = [];
        bodyEl.querySelectorAll("pre[class*='brush']").forEach((p) => {
          const m = /brush\s*:\s*([^;\s]+)/i.exec(p.className || "");
          if (m) names.push(m[1]);
        });
        GM_setValue("mcmodderPreviewBrushStash", JSON.stringify({ t: Date.now(), names }));
      } catch (e) {
        console.warn("[MCModder-Lite] 预览刷名捕获失败：", e);
      }
    },
    true,
  );
}
