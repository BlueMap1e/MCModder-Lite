/**
 * bbs 帖内附件图片比例修复。
 *
 * 站点 common.js 的 thumbImg() 在附件图片 onload 时按「当前渲染盒」重算尺寸并
 * 烤进 width/height 属性。占位图 none.gif 为 1×1 透明 GIF，按服务端 width="600"
 * 属性等比撑成 600×600 隐形盒；真实图片在首屏加载竞争的布局窗口期完成 onload
 * 时，布局尚未反映新图尺寸，thumbImg 量到占位盒的 1:1 → 写死 600×600 → 宽图
 * 被横向压缩（实测多为帖子首图，thread-24179 稳定复现，站方无事后校正）。
 * 真实比例可从 naturalWidth/naturalHeight 事后核对：只修「宽高属性齐备且与
 * 自然比例偏差 > 2%」的图片，把 height 就地改回当前宽度下的等比值；正常的
 * thumbImg 输出与自然比例一致（舍入误差 < 0.5%），不受影响。
 *
 * 入口不走 InitLoader：bbs.mcmod.cn 在 main.ts 分流后只跑 initBbsDarkMode，
 * Mcmodder / InitLoader / ConfigRepository 均不在该域构造（CodeBrushInit 叶子
 * 模块先例），由 main.ts 的 bbs 分支传入开关安装。
 */

/** 比例容差：正常 thumbImg 输出只有舍入误差（< 0.5%），2% 内视为站点有意行为 */
const RATIO_TOLERANCE = 0.02;

/** 单图纠偏：宽高属性齐备且比例失真时，把 height 改回当前渲染宽度下的等比值 */
function repair(img: HTMLImageElement): void {
  // 未加载 / 加载失败 / 占位图（none.gif，naturalWidth=1）不参与；
  // 站点 thumbImg 没烤过属性（外部链接图等）时浏览器本来就在等比渲染，也不参与
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
    return;
  }
  const widthAttr = img.getAttribute("width");
  const heightAttr = img.getAttribute("height");
  if (!widthAttr || !heightAttr) {
    return;
  }
  const width = parseFloat(widthAttr);
  const height = parseFloat(heightAttr);
  if (!(width > 0) || !(height > 0)) {
    return;
  }
  const naturalRatio = img.naturalWidth / img.naturalHeight;
  const attrRatio = width / height;
  if (Math.abs(attrRatio - naturalRatio) / naturalRatio <= RATIO_TOLERANCE) {
    return;
  }
  // 用渲染宽度算等比高度：受站点 CSS max-width 约束时取实值（与 thumbImg 的
  // 测量口径一致）；渲染为 0 时回退属性宽度
  const renderedWidth = img.offsetWidth || width;
  img.setAttribute("height", String(Math.round(renderedWidth / naturalRatio)));
}

function sweep(root: Document | Element): void {
  root.querySelectorAll<HTMLImageElement>("img.zoom").forEach(repair);
}

export const installBbsImageAspectFix = (enabled: boolean): void => {
  if (!enabled) {
    return;
  }
  // load 捕获监听覆盖 lazyload 换 src 后的一切加载（含回帖 AJAX 新增楼层）。
  // 站点 thumbImg 挂在 img 自身（onload 属性），document 捕获先于它触发；
  // 纠偏放进 setTimeout(0)，等 load 事件分发（含 thumbImg 的同步写入）结束后
  // 再读属性，读到的是站点写入的最终值
  document.addEventListener(
    "load",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement && target.classList.contains("zoom")) {
        setTimeout(() => repair(target), 0);
      }
    },
    true,
  );
  // 一次性兜底清扫：监听安装前已完成加载的缓存图不会再来 load 事件。
  // 立即 + 两个延迟拍，与 main.ts 白底清扫的定时拍同款节奏；thumbImg 的
  // zw<2 重试路径（+100ms 重写）只在 width 属性缺失时触发，而缺属性本就是
  // 本修复的跳过条件，两个机制不会互踩
  const delayedSweeps = () => {
    sweep(document);
    setTimeout(() => sweep(document), 300);
    setTimeout(() => sweep(document), 1000);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", delayedSweeps, { once: true });
  } else {
    delayedSweeps();
  }
};
