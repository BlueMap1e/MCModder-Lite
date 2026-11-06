import { Init } from "./Init";

/**
 * 找服玩服务器详情页（play.mcmod.cn/sv*.html）：历史在线人数折线图的夜间重主题化。
 *
 * 站点内联建图代码（sv 页模板）把折线与数据点写死为深灰 #3c454c（适配日间白底），
 * 夜间贴深底几乎不可见（canvas 绘制，CSS 无法覆盖）。上游靠给图表叠背景图"缓解"，
 * 此处按用户当前主题的强调色重绘线条。
 *
 * 时序：内联脚本 echarts.init 后同步 setOption，`_echarts_instance_` 属性观察者在
 * 回调触发时（微任务点）拿到的必是已带配色的实例；我们晚于其执行时由 run() 末尾的
 * 首次 apply() 兜底。改查询日期范围时站点只重设数据（details.js 的 getOnlineLogData
 * 仅 setOption xAxis/series.data，ECharts merge 语义保留我们改过的线色），无需额外
 * 补打钩子；日间还原用首次捕获的原始 series 颜色片段。
 */
export class PlayServerPageInit extends Init {
  canRun() {
    return /\/\/play\.mcmod\.cn\/sv\d+\.html/.test(this.parent.href);
  }

  /** 首次夜间改写前捕获的原始 series 颜色（日间还原用） */
  private chartOriginalColor = "";

  private setupNightChartFix() {
    const apply = () => {
      const el = document.getElementById("chart-online");
      if (!el || typeof echarts === "undefined") return;
      const chart = echarts.getInstanceByDom(el);
      if (!chart) return;
      const night = document.documentElement.classList.contains("dark");
      // 强调色取自用户当前主题（夜档），与类页雷达图修复同源
      const accent =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--mcmodder-color-accent")
          .trim() || "#35c1fd";
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
        // 幂等标记：线色已是当前强调色则跳过
        if (current.series[0].lineStyle?.color === accent) return;
        if (!this.chartOriginalColor) {
          this.chartOriginalColor = current.series[0].color || "#3c454c";
        }
        writeSeriesColor(accent);
      } else if (this.chartOriginalColor) {
        writeSeriesColor(this.chartOriginalColor);
        this.chartOriginalColor = "";
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
    this.setupNightChartFix();
  }
}
