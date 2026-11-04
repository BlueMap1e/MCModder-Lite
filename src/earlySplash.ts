// 必须是打包产物中第一个求值的模块：防闪烁遮罩要赶在一切 import 之前落墙。
// 整包（vue/codemirror/dexie…）的模块求值有 16-84ms 开销，缓存命中（F5）的页面
// 会在这段窗口内完成首帧绘制，浅色站点抢先上屏即「F5 白闪」——
// Ctrl+F5 因站点 CSS 走网络（渲染阻塞）反而必不闪白，正是此竞态的指纹。
import { GM_getValue } from "$";

export const nightMode: boolean = (() => {
  try {
    return !!JSON.parse(GM_getValue("mcmodderSettings") || "{}").nightMode;
  } catch {
    return false;
  }
})();

export const splashStyle: HTMLStyleElement = document.createElement("style");
splashStyle.id = "mcmodder-splash-screen";
splashStyle.textContent = `html { background: ${nightMode ? "#111" : "#fff"} !important; } body { visibility: hidden !important; }`;
if (document.documentElement != null) {
  document.documentElement.appendChild(splashStyle);
} else {
  // document-start 的兜底：极早注入时 documentElement 理论上已存在，防御性保留
  document.addEventListener("DOMContentLoaded", () => {
    if (document.documentElement != null) {
      document.documentElement.appendChild(splashStyle);
    }
  });
}
