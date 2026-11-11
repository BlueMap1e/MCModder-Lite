import { ScheduleRequestUtils } from "../schedulerequest/ScheduleRequestUtils";
import { Utils } from "../Utils";

interface CountdownEntry {
  getter: TimerDataGetter;
  formatter: TimerDataFormatter;
}

export class TimerUtils {
  static CLASSNAME = "mcmodder-timer";

  static DATAGETTER_SCHEDULE =
    (id: keyof ScheduleRequestTypes, user: number | null, list: ScheduleRequestUtils) => () =>
      list.find(id, user)?.time || 0;
  static DATAGETTER_CONSTANT = (time: number) => () => time;

  static DATAFORMATTER_EN = Utils.getFormattedTime;
  static DATAFORMATTER_ZH = Utils.getFormattedChineseTime;

  /**
   * 共享倒计时表：所有倒计时共用一个 1 s ticker，而不是每个倒计时各起一个
   * `setInterval`。节点被站点重渲染移出文档时，下一次 tick 自动注销，
   * 因此不需要调用方持有组件实例（旧实现每条短评一个 Vue 应用 + 一个定时器，
   * 重渲染后定时器与实例都残留）。
   */
  private static readonly countdowns = new Map<HTMLElement, CountdownEntry>();
  private static ticker: number | undefined;

  /** 把一个倒计时绑到元素上，返回注销函数（通常不用调，节点移除后会自动清理） */
  static mountCountdown(
    el: HTMLElement,
    getter: TimerDataGetter,
    formatter: TimerDataFormatter = this.DATAFORMATTER_EN,
  ) {
    this.countdowns.set(el, { getter, formatter });
    this.ensureTicker();
    this.renderCountdown(el);
    return () => this.unmountCountdown(el);
  }

  static unmountCountdown(el: HTMLElement) {
    this.countdowns.delete(el);
    this.stopTickerIfIdle();
  }

  private static ensureTicker() {
    if (this.ticker === undefined) {
      this.ticker = window.setInterval(() => this.tick(), 1000);
    }
  }

  private static stopTickerIfIdle() {
    if (this.countdowns.size === 0 && this.ticker !== undefined) {
      window.clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private static tick() {
    for (const [el] of this.countdowns) {
      if (!el.isConnected) {
        this.countdowns.delete(el);
        continue;
      }
      this.renderCountdown(el);
    }
    this.stopTickerIfIdle();
  }

  private static renderCountdown(el: HTMLElement) {
    const entry = this.countdowns.get(el);
    if (!entry) return;
    const target = entry.getter();
    el.textContent = target ? entry.formatter(target - Date.now()) : "-";
  }
}
