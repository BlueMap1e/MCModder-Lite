import { Init } from "./Init";

export class ToolsPageInit extends Init {
  canRun() {
    // 实用工具页（/tools/*）：cbcreator 等自带 matrix 模板的站点子应用。
    // 仅限主站 www 域；bbs / center / admin 各域没有 /tools/ 路径。
    return /\/\/www\.mcmod\.cn\/tools\//.test(this.parent.href);
  }

  run() {
    // 标记类：base.css 的工具页夜间规则以此限定作用域。这些规则覆盖的是
    // 站点自带模板的通用类名（#content / .modal-header / .widget-box 等），
    // 不打标记会波及主站其他页面的同名 Bootstrap 类
    document.documentElement.classList.add("mcmodder-tools-page");
  }
}
