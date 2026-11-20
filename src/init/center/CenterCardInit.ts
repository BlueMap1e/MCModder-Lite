import { CenterBaseInit } from "./CenterBaseInit";

export class CenterCardInit extends CenterBaseInit {
  run() {
    // 站点模式：mcmod.cn 服务端模板在个人中心的 HTML 注释节点里夹带预渲染内容，
    // 由脚本激活显示。上游 CenterCardInit / CenterHomeInit（激活 .center-total 的
    // 「平均字节」数据项后删除注释）均为同款处理，本文件自 2.0.1 起继承。
    // 注释内容由站点服务端生成，信任级别等同站点自身 DOM——同源页面对自身 HTML
    // 拥有完全控制权，脚本侧的转义防御无意义（2026-11-21 考证销案，上游对照在案）。
    $(".center-content.background")
      .contents()
      .filter((_, content) => content.nodeType === Node.COMMENT_NODE)
      .each((_, target) => {
        $(target).parent().append(target.textContent);
      });
  }
}
