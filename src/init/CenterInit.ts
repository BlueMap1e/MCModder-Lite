import { Values } from "../Values";
import { CenterCardInit } from "./center/CenterCardInit";
import { CenterSettingInit } from "./center/CenterSettingInit";
import { Init } from "./Init";

/** SPA 子页的挂载配置 */
interface CenterPage {
  /** 子页容器选择器，不在 DOM 中时直接跳过 */
  selector: string;
  /** 就绪后执行的初始化 */
  init: () => void;
  /** 当前 DOM 是否已就绪；不传则视为「已就绪」（回调自身幂等时可只依赖变化通知） */
  isReady?: () => boolean;
  /** 是否为一次性初始化，默认为 true；为 false 时持续监听后续重渲染 */
  once?: boolean;
  subtree?: boolean;
}

export class CenterInit extends Init {
  protected pageUID = -1;

  canRun() {
    return this.parent.href.includes("center.mcmod.cn");
  }

  isMyPage() {
    return this.pageUID === this.parent.currentUID;
  }

  getPageUID() {
    return this.pageUID;
  }

  /** 夜间改写前捕获的原始 option 片段（日间还原用） */
  private chartOriginalOption?: string;

  /**
   * 夜间模式下的活跃度热力图（个人中心首页 `#center-editchart-obj`，ECharts 日历图）重主题化：
   * 站点建图代码把空白格子的 `itemStyle.color` 硬编码为 "#fff"、日/月标签为 "#000"，
   * tooltip 也是白底（canvas 绘制，CSS 无法覆盖），夜间模式下是一块白格子拼图。
   *
   * 时序要点：`_echarts_instance_` 属性在 `echarts.init()` 时就会出现，而站点自己的
   * `setOption`（携带 "#fff"）在其后异步到达——若只应用一次会被覆盖。因此夜间应用后
   * 还要在若干延时点复检，被覆盖就重新应用；日间按首次捕获的原始 option 片段
   * （`getOption()` 已有内容时）原样还原，尚无内容时什么都不做
   * （站点随后到达的 setOption 本身就是日间样式）。`html` 的 `dark` 类切换同样触发。
   * 实现模式与 `ClassPageInit.setupNightChartFix`（评分雷达图）一致。
   */
  private setupNightChartFix() {
    const apply = () => {
      const el = document.getElementById("center-editchart-obj");
      if (!el) return;
      if (typeof echarts === "undefined") return;
      const chart = echarts.getInstanceByDom(el);
      if (!chart) return;
      const night = document.documentElement.classList.contains("dark");
      const current = chart.getOption();
      if (night) {
        if (current?.calendar?.[0]?.itemStyle?.color !== "#3330") {
          if (current?.calendar?.length && !this.chartOriginalOption) {
            this.chartOriginalOption = JSON.stringify({
              tooltip: current.tooltip,
              calendar: current.calendar,
            });
          }
          // 强调色取自用户当前主题（夜档）
          const accent =
            getComputedStyle(document.documentElement)
              .getPropertyValue("--mcmodder-color-accent")
              .trim() || "#35c1fd";
          chart.setOption({
            tooltip: { backgroundColor: "#222", textStyle: { color: "#aaa" } },
            calendar: {
              itemStyle: { color: "#3330", borderColor: "#444" },
              dayLabel: { color: "#fff" },
              monthLabel: { color: "#fff" },
              yearLabel: { color: accent },
            },
          });
          // 站点的日间 option 可能晚于我们到达（见时序说明），安排复检补打
          for (const delay of [100, 300, 800, 2000]) {
            setTimeout(apply, delay);
          }
        }
      } else if (this.chartOriginalOption) {
        chart.setOption(JSON.parse(this.chartOriginalOption));
        this.chartOriginalOption = undefined;
      }
    };
    // 图表创建：站点给容器打上 _echarts_instance_ 属性（attributeFilter 过滤后触发极廉价）
    new MutationObserver(apply).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["_echarts_instance_"],
    });
    // 夜间开关：dark 类切换时重新应用
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    apply();
  }

  /**
   * 挂载一个 SPA 子页：子页 DOM 有可能在本脚本注入之前就已渲染完成（bFCache 恢复、注入偏晚等），
   * 此时 MutationObserver 不会再补发之前的变更记录，所以先同步检测一次「当前是否已就绪」。
   * 就绪条件只写一遍，之后每次 DOM 变动都用它重新判定，故无需再区分 added/removed 节点。
   */
  private watchPage(page: CenterPage) {
    const target = $(page.selector).get(0);
    if (!target) return;
    const tryInit = () => {
      if (page.isReady && !page.isReady()) return false;
      page.init();
      return true;
    };
    // 一次性初始化在这里就已经完成，无需再挂观察者
    if (tryInit() && page.once) return;
    const observer = new MutationObserver(() => {
      if (tryInit() && page.once) observer.disconnect();
    });
    observer.observe(target, { childList: true, subtree: page.subtree });
  }

  run() {
    this.pageUID = Number(this.parent.href.split("center.mcmod.cn/")[1].split("/")[0]);

    // 活跃度热力图的夜间重主题化（图表在首页 tab，SPA 切换后重建也能被观察者接住）
    this.setupNightChartFix();

    this.watchPage({
      selector: "#center-page-setting",
      init: () => new CenterSettingInit(this).run(),
      isReady: () => $("#center-page-setting").children().length > 1,
      // 设置页每次进入都会重渲染，回调只重绑事件，保持观察
      once: false,
    });
    this.watchPage({
      selector: "#center-page-card",
      init: () => new CenterCardInit(this).run(),
      // 占位 loading 已移除且卡片内容已渲染
      isReady: () =>
        $("#center-page-card .loading").length === 0 &&
        $("#center-page-card .center-content.background").length > 0,
    });
    // 快捷获取背景图像
    const bgImg = window
      .getComputedStyle(document.body)
      .backgroundImage.replace('url("', "")
      .replace('")', "");
    const suffix = bgImg.split(".").pop()?.toLowerCase();
    if (
      bgImg !== this.configs.getSettings("defaultBackground") &&
      suffix &&
      Values.supportedImageSuffix.includes(suffix)
    )
      $("div.bbs-link").append(
        `<p align="right"><a href="${bgImg}" target="_blank">查看个人中心背景图片</a></p>`,
      );

    // 近期编辑记录
    $("div.bbs-link").append(`
      <p align="right"><a href="${this.parent.hostname}/verify.html?order=createtime&userid=${this.getPageUID()}" target="_blank">查看近期提交审核列表</a></p>
    `);
  }
}
