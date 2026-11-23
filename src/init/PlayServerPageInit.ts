import { Init } from "./Init";

/** ECharts 实例（宿主库为 any，按返回值推导，避免显式 any） */
type ChartInstance = NonNullable<ReturnType<typeof echarts.getInstanceByDom>>;

/** 图表 tooltip 与坐标轴配色的日间原值（首次夜间改写时捕获，日间还原用） */
interface ChartOriginals {
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  xLabel: string;
  xLine: string;
  yLabel: string;
  yLine: string;
  ySplit: string;
}

/**
 * 找服玩服务器详情页（play.mcmod.cn/sv*.html）：历史在线人数折线图的夜间适配。
 *
 * 站点内联建图代码（sv 页模板）把折线与数据点写死为深灰 #3c454c、tooltip 写死白底
 * 黑字、坐标轴文字灰、辅助线 #E0E6F1（适配日间白底）。夜间贴深底时：折线不可见、
 * tooltip 刺眼、辅助线比标签更亮（主次颠倒）。canvas 绘制，CSS 无法覆盖，只能写
 * ECharts option。上游靠给图表叠背景图"缓解"，此处按用户当前主题重绘：
 *
 * - 折线/数据点：主题强调色（既有逻辑）；
 * - tooltip：夜间面底色 + 浅色文字；
 * - 坐标轴标签：正文亮色；轴线/刻度：次级文字色；辅助线：深面底色（压暗）；
 * - 日间还原全部捕获的原值，昼夜对称可逆。
 *
 * 另修一个站点竞态：图建在布局稳定前时 canvas 宽度会大于容器（实测 1232 vs 1206），
 * 辅助线与横轴溢出内容右边界，刷新偶发。每次 apply 时对宽度做一次校正 resize。
 *
 * 时序：内联脚本 echarts.init 后同步 setOption，`_echarts_instance_` 属性观察者在
 * 回调触发时（微任务点）拿到的必是已带配色的实例；我们晚于其执行时由 run() 末尾的
 * 首次 apply() 兜底。改查询日期范围时站点只重设数据（details.js 的 getOnlineLogData
 * 仅 setOption xAxis/series.data，ECharts merge 语义保留我们改过的样式）。
 */
export class PlayServerPageInit extends Init {
  canRun() {
    return /\/\/play\.mcmod\.cn\/sv\d+\.html/.test(this.parent.href);
  }

  /** 首次夜间改写前捕获的原始 series 颜色（日间还原用） */
  private chartOriginalColor = "";
  /** 首次夜间改写前捕获的 tooltip / 坐标轴原值（日间还原用） */
  private chartOriginals?: ChartOriginals;
  /** 容器宽度监听：站点首屏布局会把容器从 1232 收缩到 1206，图表只在建图时量一次宽 */
  private resizeObserver?: ResizeObserver;
  private resizeObserverEl?: HTMLElement;
  private resizeRaf?: number;

  /** 下一帧校正 canvas 宽度（ResizeObserver 一帧内可能多次回调，rAF 合并） */
  private scheduleSizeCorrection(el: HTMLElement) {
    if (this.resizeRaf !== undefined) return;
    this.resizeRaf = window.requestAnimationFrame(() => {
      this.resizeRaf = undefined;
      const chart = echarts.getInstanceByDom(el);
      const canvas = el.querySelector("canvas");
      if (!chart || !canvas || !el.clientWidth) return;
      if (Math.abs(Math.round(canvas.getBoundingClientRect().width) - el.clientWidth) > 1) {
        chart.resize();
      }
    });
  }

  private cssVar(name: string, fallback: string) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /** 夜间 tooltip / 坐标轴配色：只写颜色，不动数据与布局 */
  private applyNightChrome(chart: ChartInstance) {
    const current = chart.getOption();
    if (!current) return;
    const target = {
      tooltipBg: this.cssVar("--mcmodder-color-background-dark2", "#232323"),
      tooltipBorder: this.cssVar("--mcmodder-color-background-dark4", "#3a3a3a"),
      tooltipText: this.cssVar("--mcmodder-color-text", "#ddd"),
      label: this.cssVar("--mcmodder-color-text-dark1", "#bbb"),
      axis: this.cssVar("--mcmodder-color-text-dark2", "#999"),
      split: this.cssVar("--mcmodder-color-background-dark2", "#232323"),
    };
    const tooltip = current.tooltip?.[0];
    // 幂等标记：tooltip 底色已是夜间目标则跳过
    if (tooltip?.backgroundColor === target.tooltipBg) return;
    if (!this.chartOriginals) {
      const splitColor = current.yAxis?.[0]?.splitLine?.lineStyle?.color;
      this.chartOriginals = {
        tooltipBg: tooltip?.backgroundColor ?? "#fff",
        tooltipBorder: tooltip?.borderColor ?? "#ccc",
        tooltipText: tooltip?.textStyle?.color ?? "#666",
        xLabel: current.xAxis?.[0]?.axisLabel?.color ?? "#6E7079",
        xLine: current.xAxis?.[0]?.axisLine?.lineStyle?.color ?? "#6E7079",
        yLabel: current.yAxis?.[0]?.axisLabel?.color ?? "#6E7079",
        yLine: current.yAxis?.[0]?.axisLine?.lineStyle?.color ?? "#6E7079",
        ySplit: (Array.isArray(splitColor) ? splitColor[0] : splitColor) ?? "#E0E6F1",
      };
    }
    chart.setOption({
      tooltip: {
        backgroundColor: target.tooltipBg,
        borderColor: target.tooltipBorder,
        textStyle: { color: target.tooltipText },
      },
      xAxis: {
        axisLabel: { color: target.label },
        axisLine: { lineStyle: { color: target.axis } },
        axisTick: { lineStyle: { color: target.axis } },
      },
      yAxis: {
        axisLabel: { color: target.label },
        axisLine: { lineStyle: { color: target.axis } },
        axisTick: { lineStyle: { color: target.axis } },
        splitLine: { lineStyle: { color: target.split } },
      },
    });
  }

  /** 日间还原 tooltip / 坐标轴原值 */
  private restoreDayChrome(chart: ChartInstance) {
    const o = this.chartOriginals;
    if (!o) return;
    chart.setOption({
      tooltip: {
        backgroundColor: o.tooltipBg,
        borderColor: o.tooltipBorder,
        textStyle: { color: o.tooltipText },
      },
      xAxis: {
        axisLabel: { color: o.xLabel },
        axisLine: { lineStyle: { color: o.xLine } },
        axisTick: { lineStyle: { color: o.xLine } },
      },
      yAxis: {
        axisLabel: { color: o.yLabel },
        axisLine: { lineStyle: { color: o.yLine } },
        axisTick: { lineStyle: { color: o.yLine } },
        splitLine: { lineStyle: { color: o.ySplit } },
      },
    });
    this.chartOriginals = undefined;
  }

  private setupNightChartFix() {
    const apply = () => {
      const el = document.getElementById("chart-online");
      if (!el || typeof echarts === "undefined") return;
      const chart = echarts.getInstanceByDom(el);
      if (!chart) return;

      // 建图早于布局稳定时 canvas 会比容器宽（实测 1232 vs 1206），轴线溢出右边界。
      // 站点首屏会把容器分多帧收缩，ECharts 只在建图时量一次宽——监听容器尺寸，
      // 稳定后再校正一次，避免逐帧 resize 抖动；不支持 ResizeObserver 时退回即时检查。
      if (typeof ResizeObserver !== "undefined") {
        if (this.resizeObserverEl !== el) {
          this.resizeObserver?.disconnect();
          this.resizeObserver = new ResizeObserver(() => this.scheduleSizeCorrection(el));
          this.resizeObserver.observe(el);
          this.resizeObserverEl = el;
        }
      } else {
        const canvas = el.querySelector("canvas");
        if (canvas && el.clientWidth) {
          const canvasWidth = Math.round(canvas.getBoundingClientRect().width);
          if (Math.abs(canvasWidth - el.clientWidth) > 1) chart.resize();
        }
      }

      const night = document.documentElement.classList.contains("dark");
      // 强调色取自用户当前主题（夜档），与类页雷达图修复同源
      const accent = this.cssVar("--mcmodder-color-accent", "#35c1fd");
      // 日间线色完全由 series.color 驱动（站点模板里的 lineStyle.normal 老式嵌套
      // 已被现代 ECharts 忽略），color / lineStyle / itemStyle 三处显式写满
      // 才能盖过上一态的显式值，夜↔日切换对称可逆
      const writeSeriesColor = (color: string) => {
        chart.setOption({
          series: [
            {
              color,
              lineStyle: { color },
              itemStyle: { color },
            },
          ],
        });
      };
      if (night) {
        const current = chart.getOption();
        if (!current?.series?.length) return;
        if (current.series[0].lineStyle?.color !== accent) {
          if (!this.chartOriginalColor) {
            this.chartOriginalColor = current.series[0].color || "#3c454c";
          }
          writeSeriesColor(accent);
        }
        this.applyNightChrome(chart);
      } else {
        if (this.chartOriginalColor) {
          writeSeriesColor(this.chartOriginalColor);
          this.chartOriginalColor = "";
        }
        this.restoreDayChrome(chart);
      }
    };
    // 图表创建：容器打上 _echarts_instance_ 属性即建好实例（attributeFilter 过滤后极廉价）
    new MutationObserver(apply).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["_echarts_instance_"],
    });
    // 夜间开关：dark 类切换时夜间重打 / 日间还原
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    apply();
  }

  run() {
    // 页面标记：夜间引用块规则只在本页生效，不波及主站资料页的 blockquote
    document.documentElement.classList.add("mcmodder-play-page");
    this.setupNightChartFix();
  }
}
