import { createApp } from "vue";
import { Utils } from "../Utils";
import Countdown from "../vue/components/Countdown.vue";
import { TimerUtils } from "../widget/TimerUtils.ts";
import { CommentJumpController } from "./CommentJump";
import { Init } from "./Init";

export class CommentInit extends Init {
  canRun() {
    // 主站短评块为服务端渲染，启动时即存在；中心 / 作者页的留言板是动态渲染的，
    // 启动时多半还不存在，因此对这两种宿主页直接放行，由 run() 里的等待逻辑接管
    return (
      !!$(".common-comment-block.lazy").length ||
      this.parent.href.includes("center.mcmod.cn") ||
      this.parent.href.includes("/author/")
    );
  }

  /** 短评跨页跳转：查找、翻页与 loading 都由它负责 */
  private readonly jump = new CommentJumpController(this.parent, this.configs);

  private displayPublishTime(target: JQuery) {
    target.find(".comment-reply-row-time").each((_, node) => {
      // 同一楼可能被重复处理（见 PROCESSED_ATTR），倒计时只挂一次
      if (node.querySelector(`.${CommentInit.PUBLISH_TIME_CLASS}`)) return;
      const published = CommentInit.parsePublishTime(node.textContent);
      const container = $(`<span class="${CommentInit.PUBLISH_TIME_CLASS}"></span>`)
        .appendTo(node)
        .get(0);
      createApp(Countdown, {
        parent: this.parent,
        dataGetter: published,
        dataFormatter: TimerUtils.DATAFORMATTER_ZH,
      }).mount(container) as InstanceType<typeof Countdown>;
      container.insertAdjacentText("beforebegin", " (");
      container.insertAdjacentText("afterend", ")");
    });
  }

  private replaceMobileClientIcon(target: JQuery) {
    const legacy = target.find(".phone");
    if (legacy.length) {
      const icon = $(
        '<i class="mcmodder-mobileclient fa fa-mobile" data-toggle="tooltip" data-original-title="移动端用户">',
      );
      legacy.replaceWith(icon);
      icon.tooltip({});
    }
  }

  private renderPagination() {
    $("ul.pagination.common-pages > span").each((_, _e) => {
      // 站点重渲染翻页条后需要重新注入，已注入过的跳过
      const e = $(_e);
      if (e.hasClass("mcmodder-comment-goto")) return;
      e.addClass("mcmodder-comment-goto");
      const gotopage = $(`<input id="mcmodder-gotopage" class="form-control">`);
      const gotofloor = $(`<input id="mcmodder-gotofloor" class="form-control">`);
      e.append(`快速跳转至：第`, gotopage, `页 / 第`, gotofloor, `楼。`);
      const [currentPage, maxPage] = e.text().replace("当前 ", "").split(" / ").map(Number);
      gotopage.val(currentPage).change(() => {
        const value = parseInt(gotopage.val().trim());
        if (value < 1 || value > maxPage) {
          Utils.commonMsg("请输入一个合法的数值...", false);
          return;
        }
        comment_nowpage = value;
        get_comment(comment_container, comment_type);
      });
      let currentFloor = 1;
      $(".comment-floor")
        .children()
        .each((_, e) => {
          const row = $(e);
          const userinfo = row.find(".comment-row-userinfo");
          if (userinfo.find(".L1").length) return; // 是置顶评论
          const floor = parseInt(userinfo.text()); // xxx楼
          if (Number.isInteger(floor)) {
            currentFloor = Math.max(floor, currentFloor);
            return false;
          }
        });
      gotofloor.val(currentFloor).change(() => {
        const targetFloor = parseInt(gotofloor.val().trim(), 10);
        if (!Number.isInteger(targetFloor) || targetFloor < 1) {
          Utils.commonMsg("请输入一个合法的数值...", false);
          return;
        }
        this.jump.startFloorJump(targetFloor);
      });
    });
  }

  /** 已完成注入的顶层短评行标记：MutationObserver 会因我们自己的异步写入（倒计时挂载、链接解析等）再次回调，靠它保证不重复注入 */
  private static readonly PROCESSED_ATTR = "data-mcmodder-comment-processed";
  /** 楼中楼行标记：与顶层楼分用，避免嵌套结构下两级标记互相干扰 */
  private static readonly REPLY_PROCESSED_ATTR = "data-mcmodder-comment-reply-processed";
  /** 发布时间倒计时容器的标记类 */
  private static readonly PUBLISH_TIME_CLASS = "mcmodder-comment-publish-time";

  /** 站点发布时间不带时区，固定按 UTC+8 解析，避免脚本在其它时区运行时倒计时整体偏移 */
  private static parsePublishTime(text: string | null) {
    const match = text?.matchAll(/\d+/g);
    if (!match) return Date.parse(text ?? "");
    const [year, month, day, hour, minute, second] = match;
    return Date.UTC(+year, +month - 1, +day, +hour, +minute, +second) - 8 * 60 * 60 * 1000;
  }

  private readonly commentObserver = new MutationObserver((mutationList) => {
    // 防广告误触发：站点的广告楼层始终单独插入，遇到即跳过整批
    if (mutationList.some((mutation) => CommentInit.isAdFloor(mutation))) return;
    // 只要有新增节点就可能带来未处理的楼层/回复。不做逐一的目标类名匹配——
    // 楼层与回复的插入形态（目标容器的类名）因页面形态（主站 / 中心页）与站点行为
    // （追加 / 整块重渲染）而异，精确匹配曾经漏掉中心页的楼中楼。
    // 统一走防抖补扫：各处理器以标记属性保证幂等，重复触发几乎零成本；
    // 站点重渲染把已注入的锚点冲掉时，新渲染出的节点同样会被补处理。
    if (mutationList.some((mutation) => mutation.addedNodes.length > 0)) {
      this.scheduleSweep();
    }
  });

  /** 补扫防抖标记 */
  private sweepScheduled = false;

  /** 防抖合并的补扫：全量处理短评块内未标记的楼层与回复 */
  private scheduleSweep() {
    if (this.sweepScheduled) return;
    this.sweepScheduled = true;
    setTimeout(() => {
      this.sweepScheduled = false;
      this.unlockComment();
      this.catchUpExistingFloors();
    }, 200);
  }

  /** 站点单独插入的广告楼层 */
  private static isAdFloor(mutation: MutationRecord) {
    return (Array.from(mutation.addedNodes) as HTMLElement[]).some(
      (e) => e.className === "google-auto-placed",
    );
  }

  private processCommentFloor(commentFloor: JQuery) {
    // 显示快速跳转面板
    this.renderPagination();

    const alertHeight = this.configs.getSettings("missileAlertHeight")!;
    const expandHeight = this.configs.getSettings("commentExpandHeight")!;
    $("div.comment-row-content", commentFloor).each((_, c) => {
      const target = $(c);
      // 本楼已注入过：二次触发时整楼跳过，避免重复追加倒计时、折叠按钮等
      if (target.attr(CommentInit.PROCESSED_ATTR)) return;
      target.attr(CommentInit.PROCESSED_ATTR, "1");

      // 隐藏黑名单用户发布的短评
      const uid = Number(target.find("a.poped").attr("data-uid"));
      if (this.configs.getSettingsAsNumberList("userBlacklist")?.includes(uid)) {
        // 用户屏蔽
        target.parent().remove();
        return;
      }

      // 楼中楼快速链接
      this.setReplyLink(target);
      const commentContent = target.find("div.comment-row-text-content.common-text.font14").get(0);
      if (this.configs.getSettings("ignoreEmptyLine")) {
        $(commentContent)
          .children()
          .filter((_, c) => c.innerHTML === "<br>")
          .remove();
      }

      // 补充 展开更多内容 按钮
      const h = commentContent.clientHeight;
      if (h > expandHeight && h < 3e2 && expandHeight < 3e2) {
        $(
          `<a class="fold text-muted"><i class="fas fa-chevron-down"></i>${PublicLangData.comment.fold.down}</a>`,
        ).appendTo(target);
        target.insertBefore(
          target.find("a.fold.text-muted").get(0) /*, target.find("ul.comment-tools").get(0) */,
        );
      }

      // 核弹警告
      if (this.configs.getSettings("missileAlert") && h > alertHeight) {
        target
          .find("a.fold.text-muted")
          .append(
            ` - <span class="mcmodder-slim-danger">核弹警告！</span>本楼展开后将会长达 <span class="mcmodder-common-danger">${h.toLocaleString()} px</span>！`,
          ); // 核弹警告
      }

      // 移动端图标优化
      this.replaceMobileClientIcon(target);
    });

    this.jump.onCommentPageRendered();
  }

  private processCommentReplyFloor(commentFloor: JQuery) {
    const autoLink = this.configs.getSettings("replyLink");
    $("div.comment-reply-row", commentFloor).each((_, _e) => {
      const e = $(_e);
      if (e.attr(CommentInit.REPLY_PROCESSED_ATTR)) return;
      e.attr(CommentInit.REPLY_PROCESSED_ATTR, "1");
      const uid = Number(e.find("a.poped").attr("data-uid"));
      if (this.configs.getSettingsAsNumberList("userBlacklist")?.includes(uid)) e.remove();
      this.setReplyLink(e);
      if (!autoLink) return;
      const replyContent = e.find("div.comment-reply-row-text-content.common-text.font14").first();
      // 评论由用户撰写：只在文本节点上原地生成 <a>，不把序列化后的 HTML 再解析一次
      Utils.linkifyTextNodes(replyContent);
    });
  }

  private unlockComment() {
    if ($(".common-comment-block.lazy").length && !$(".comment-close").length) return;
    if (!this.configs.getSettings("unlockComment")) return;
    // 无限制留言板
    const commentClassName = "common-comment-block lazy";
    const messageCenter =
      $(".center-block:last-child()").get(0) ||
      $(".common-comment-block.lazy .comment-editor").get(0) ||
      $(".author-row").get(0);
    const messageBoard = document.getElementsByClassName(commentClassName);
    if (messageCenter && (!messageBoard.length || $(".comment-close").length)) {
      const t1 = document.createElement("div");
      t1.className = commentClassName;
      t1.style = "";
      const t = messageCenter.appendChild(t1);
      Utils.addScript(
        t,
        "comment_channel = '1';comment_user_id = '1';comment_user_editnum = '19732';comment_user_wordnum = '1356802';$(document).ready(function(){$(\".comment-channel-list li a.c1\").click();});",
      );
      $(t).append('<div><ul class="comment-floor"></ul></div>');
      Utils.addScript(
        t,
        `get_comment(comment_container,comment_type);var isUEReady=0;if($(".comment-editor-area .editor-frame").length>0&&0==isUEReady)var ueObj=$.ajax({url:"${this.parent.hostname}/static/ueditor/",async:!0,type:"post",data:{type:"comment"},xhrFields:{withCredentials:true},crossDomain:true,complete:function(e){$(".comment-editor-area .editor-frame .load").html(ueObj.responseText),isUEReady=1}});`,
      );
      if ($(".comment-close").length && $(".comment-dl-tips").length) {
        // messageCenter.insertBefore($(".common-comment-block.lazy", messageCenter).get(0), $(".comment-dl-tips", messageCenter).get(0));
        $(".comment-close").remove();
      }
    }
  }

  private setReplyLink(target: JQuery) {
    this.jump.notifyCommentRendered(target);
  }

  /** 把 MutationObserver 挂到短评块上；块尚未渲染时返回 false */
  private attachCommentObserver() {
    const commentContainer = $(".common-comment-block.lazy");
    if (!commentContainer.length) return false;
    this.commentObserver.observe(commentContainer.get(0), {
      childList: true,
      subtree: true,
    });
    return true;
  }

  /** 对挂载观察者之前已渲染的楼层做一次补处理（各处理器以标记属性保证幂等） */
  private catchUpExistingFloors() {
    $(".comment-floor").each((_, f) => this.processCommentFloor($(f)));
    $(".comment-reply-floor").each((_, f) => this.processCommentReplyFloor($(f)));
    // 发布时间倒计时：顶层楼与楼中楼都要处理，逐节点幂等
    this.displayPublishTime($(".common-comment-block.lazy"));
  }

  run() {
    if (this.configs.getSettings("commentExpandHeight")) {
      const commentHeight = this.configs.getSettings("commentExpandHeight") || "300";
      Utils.addStyle(`.comment-row-text {max-height: ${commentHeight}px;}`);
    }
    const onBoardHost =
      this.parent.href.includes("center.mcmod.cn") || this.parent.href.includes("/author/");
    if (onBoardHost && $(".comment-close").length) {
      // 关闭状态的留言板：关闭提示已渲染，维持「无限制留言板」的原有强开语义
      this.unlockComment();
    }
    if (this.jump.start()) {
      $(".common-comment-block.lazy").get(0)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    if (!this.attachCommentObserver() && onBoardHost) {
      // 留言板晚于脚本启动渲染（中心 / 作者页动态内容）：先在文档级等待它出现，
      // 出现后换回窄观察者，并对渲染时已存在的楼层补处理。
      // 注意不可在等待阶段盲目调 unlockComment——开放留言板随后会原生渲染，
      // 提前注入会造出重复留言板。
      // 观察目标用 documentElement 而非 body：document-start 时 <body> 尚未解析，
      // observe(document.body) 会抛 TypeError（harness 后注入场景测不出这一差异）。
      const waiter = new MutationObserver(() => {
        if (this.attachCommentObserver()) {
          waiter.disconnect();
          this.catchUpExistingFloors();
        } else if ($(".comment-close").length && this.configs.getSettings("unlockComment")) {
          waiter.disconnect();
          this.unlockComment();
          this.attachCommentObserver();
        }
      });
      // 15 秒仍等不到留言板就放弃，避免整个会话常驻一个 document 级观察者
      // （成功分支已提前 disconnect，此定时器到点后只是空操作）
      window.setTimeout(() => waiter.disconnect(), 15000);
      waiter.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
}
