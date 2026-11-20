import { CenterBaseInit } from "./CenterBaseInit";

export class CenterCardInit extends CenterBaseInit {
  run() {
    // 已知注入面（2026-11-20 审计 P3）：HTML 注释的 textContent 被当作 HTML 解析后
    // 插入文档。语义可能是「激活站点藏在注释里的占位内容」——改成文本节点会破坏
    // 该机制，且无登录态可验证 center 页的真实行为，属功能取舍，搁置并在此标记。
    $(".center-content.background")
      .contents()
      .filter((_, content) => content.nodeType === Node.COMMENT_NODE)
      .each((_, target) => {
        $(target).parent().append(target.textContent);
      });
  }
}
