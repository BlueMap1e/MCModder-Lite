import { AdvancedUEditor } from "../ueditor/AdvancedUEditor";
import { Utils } from "../Utils";
import { sanitizeHTML } from "../vue/composables/useSanitizedHTML";
import { GeneralEditInit } from "./GeneralEditInit";
import { Init } from "./Init";

export class VersionEditInit extends Init {
  canRun() {
    return this.parent.href.includes("/version/add") || this.parent.href.includes("/version/edit");
  }

  private checkIfValid(t: string, m: number, ma: number) {
    const nt = Number(t);
    return m <= nt && nt <= ma;
  }

  async run() {
    new GeneralEditInit(this.parent).run();

    // 快速设置日期
    const currentTime = new Date();
    const year = currentTime.getFullYear();
    $(
      '<input id="mcmodder-date-editor" class="form-control" placeholder="输入 yymmdd 格式数字以快捷设置日期~">',
    )
      .appendTo($("li.tab-li:nth-child(1)").first())
      .bind("change", (e) => {
        const target = e.currentTarget as HTMLInputElement;
        const date = [target.value.slice(0, 2), target.value.slice(2, 4), target.value.slice(4, 6)];
        if (!(
          this.checkIfValid(date[0], 9, year - 2e3) &&
          this.checkIfValid(date[1], 1, 12) &&
          this.checkIfValid(date[2], 1, 31)
        ))
          return;
        if (date[1].charAt(0) === "0") date[1] = date[1].slice(1);
        if (date[2].charAt(0) === "0") date[2] = date[2].slice(1);
        $("#class-version-updatetime-year").selectpicker("val", "20" + date[0]);
        $("#class-version-updatetime-month").selectpicker("val", date[1]);
        $("#class-version-updatetime-day").selectpicker("val", date[2]);
        $("li.tab-li:nth-child(3) > div:nth-child(2) > input:nth-child(1)").first().focus();
      });
    // setTimeout(editorInit, 1e3);

    // 自动从 CurseForge/Modrinth 源获取日志
    const param = new URLSearchParams(window.location.search);
    let source = 0,
      id;
    if (param.get("cfid")) {
      source = 1;
      id = param.get("cfid");
    } else if (param.get("mrid")) {
      source = 2;
      id = param.get("mrid");
    }
    if (source) {
      const fileid = param.get("fileid");
      let resp, data;
      if (source === 1) {
        resp = await this.parent.utils.createRequest(
          {
            url: `https://www.curseforge.com/api/v1/mods/${id}/files/${fileid}/change-log`,
            method: "GET",
          },
          "从 CF 获取日志内容",
        );
        data = JSON.parse(resp.responseText).changelogBody;
        // 日志正文来自 CurseForge（模组作者可控），进编辑器前按白名单清洗
        if (data) data = sanitizeHTML(String(data));
      } else if (source === 2) {
        resp = await this.parent.utils.createRequest(
          {
            url: `https://api.modrinth.com/v2/version/${fileid}`,
            method: "GET",
          },
          "从 MR 获取日志内容",
        );
        data = JSON.parse(resp.responseText).changelog;
      }
      if (data) {
        // 编辑器懒加载，轮询等就绪；旧的固定 1.1s 延迟在编辑器加载慢时会静默失败
        let tries = 20; // 300ms × 20，共 6s 窗口
        const fill = () => {
          const ueditor = this.parent.ueditorFrame?.[0] as AdvancedUEditor | undefined;
          const frameBody = ($("#ueditor_0").get(0) as HTMLIFrameElement | undefined)
            ?.contentDocument?.body;
          const ready =
            source === 1
              ? !!(typeof editor !== "undefined" && editor.body && frameBody)
              : !!ueditor?.mdEditor;
          if (!ready) {
            if (--tries > 0) {
              setTimeout(fill, 300);
            } else {
              Utils.commonMsg("编辑器加载超时，日志自动填充未完成，可刷新页面重试", false);
            }
            return;
          }
          if (source === 1) {
            editor.setContent(data);
          } else if (ueditor?.mdEditor) {
            ueditor.mdEditor.setValue(data);
          }
          let f = false;
          if (frameBody) {
            for (let i = 1; i < 6; i++)
              $(frameBody)
                .find("h" + i)
                .each((_, e) => {
                  // 标题文本可能是作者可控内容，重组成百科标记前先转义
                  const headingText = Utils.escapeHTML(e.textContent ?? "");
                  $(e).replaceWith(`<p>[h${i}=${headingText}]</p>`);
                  f = true;
                });
            if (f) $(frameBody).append("<p>[ban:title_menu]</p>");
            $(frameBody).trigger("keyup");
          }
        };
        fill();
      }
      $("[data-multi-id=name]").val(param.get("ver") || "");
      $("[data-multi-id=mcversion]").val(param.get("mcver") || "");
      // date 参数为毫秒时间戳；缺失或非法时跳过日期预填（旧代码会把 NaN 写进输入框）
      const dateTs = Number(param.get("date"));
      if (Number.isFinite(dateTs) && dateTs > 0) {
        const d = new Date(dateTs);
        $("#mcmodder-date-editor")
          .val((d.getFullYear() % 1e2) * 1e4 + (d.getMonth() + 1) * 1e2 + d.getDate())
          .trigger("change");
      }
    }
  }
}
