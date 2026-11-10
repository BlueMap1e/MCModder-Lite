import { Init } from "./Init";

export class SandboxInit extends Init {
  canRun() {
    return this.parent.href.includes("/sandbox/");
  }
  run() {
    // 「沙盒页移除侧栏」开关（默认关）：布局决定权留给编辑，默认保持站点原生形态
    if (!this.configs.getSettings("sandboxSidebarRemoval")) return;
    $(".left").remove();
    $(".right").css("padding-left", 0);
  }
}
