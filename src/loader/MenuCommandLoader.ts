import { GM_registerMenuCommand } from "$";
import { Values } from "../Values";

export class MemuCommandLoader {
  static run() {
    GM_registerMenuCommand("打开设置", Values.menuCommands.settings);
    GM_registerMenuCommand("输出调试信息", Values.menuCommands.exportLogs);
  }
}
