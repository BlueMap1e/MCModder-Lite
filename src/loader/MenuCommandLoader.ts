import { GM_registerMenuCommand } from "$";
import { Values } from "../Values";

export class MenuCommandLoader {
  static run() {
    // 方法引用包箭头：脱开 Values 的 this 绑定面（unbound-method），调用语义不变
    GM_registerMenuCommand("打开设置", () => Values.menuCommands.settings());
    GM_registerMenuCommand("输出调试信息", () => Values.menuCommands.exportLogs());
  }
}
