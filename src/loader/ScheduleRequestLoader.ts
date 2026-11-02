import {
  ScheduleRequestTriggerType,
  ScheduleRequestUtils,
} from "../schedulerequest/ScheduleRequestUtils";
import { AutoCheckinScheduleRequest } from "../schedulerequest/types/AutoCheckinScheduleRequest";

/**
 * 计划任务加载器：注册全部计划任务，并挂上每秒一次的轮询。
 *
 * 各任务的触发方式与参数（配置项 / 最小阈值 / 是否要求登录）见下面每个 `addRequestType` 的调用，
 * 间隔的具体数值则由各任务自己的 `run` 决定。
 */
export class ScheduleRequestLoader {
  /**
   * 注册任务并启动轮询。
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
    // 调度器本身不含定时器，轮询由这里驱动
    setInterval(() => list.check(), 1e3);
  }
}
