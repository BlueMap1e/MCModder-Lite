import {
  ScheduleRequestTriggerType,
  ScheduleRequestUtils,
} from "../schedulerequest/ScheduleRequestUtils";
import { AutoCheckinScheduleRequest } from "../schedulerequest/types/AutoCheckinScheduleRequest";

/**
 * 计划任务加载器：注册全部计划任务，并按最近到期时间挂上单次定时器。
 *
 * 各任务的触发方式与参数（配置项 / 最小阈值 / 是否要求登录）见下面每个 `addRequestType` 的调用，
 * 间隔的具体数值则由各任务自己的 `run` 决定。
 */
export class ScheduleRequestLoader {
  /**
   * 注册任务并安排首次调度。
   *
   * @param list 调度器。
   */
  static run(list: ScheduleRequestUtils) {
    list.addRequestType(
      "autoCheckin",
      new AutoCheckinScheduleRequest(list.parent),
      ScheduleRequestTriggerType.CONFIG,
      "autoCheckin",
      0,
      true,
    ); // 自动签到
    // 启动时按现有待办排下一次 check；此后任何列表变更（排期 / 移除 / 执行后清理）
    // 都经 ScheduleRequestUtils.set 自动重排——取代旧的每秒 setInterval（审计 F-11）
    list.scheduleNext();
  }
}
