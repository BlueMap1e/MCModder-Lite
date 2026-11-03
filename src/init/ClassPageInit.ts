import { Utils } from "../Utils";
import { Values } from "../Values";
import { Init } from "./Init";
import svgPlarformForge from "../assets/platform/forge.svg";
import svgPlatformFabric from "../assets/platform/fabric.svg";
import svgPlatformNeoForge from "../assets/platform/neoforge.svg";
import svgPlatformQuilt from "../assets/platform/quilt.svg";
import svgPlatformRift from "../assets/platform/rift.svg";
import svgPlatformLiteLoader from "../assets/platform/liteloader.svg";
import svgPlatformNilLoader from "../assets/platform/nilloader.svg";
import svgPlatformJavaAgent from "../assets/platform/javaagent.svg";
import svgPlatformDefault from "../assets/platform/default.svg";
import { MainText } from "../widget/MainText";

export class ClassPageInit extends Init {
  static readonly maxRecentlyVisitedLength = 50;
  static classPageRegExp = /class\/[0-9]*\.html/;
  static modpackPageRegExp = /modpack\/[0-9]*\.html/;
  private isClassPage?: boolean;
  private pageTypeName?: "模组" | "整合包";

  canRun() {
    return (
      !this.parent.href.includes("/class/version/") &&
      !this.parent.href.includes("/modpack/version/") &&
      (ClassPageInit.classPageRegExp.test(this.parent.href) ||
        ClassPageInit.modpackPageRegExp.test(this.parent.href))
    );
  }

  private async syncSubscribeList(modID: number) {
    await Utils.sleep(1e3);
    const hasSubscribed = $(".subscribe i.fas").length;
    let subscribeModlist = this.configs.getProfile("subscribeModlist") ?? [];
    if (!hasSubscribed && subscribeModlist.includes(modID)) {
      subscribeModlist = subscribeModlist.filter((e) => e != modID);
      this.configs.setProfile("subscribeModlist", subscribeModlist);
      this.configs.set("latestEditTime", modID.toString(), 0);
      Utils.commonMsg("成功同步关注状态~");
    } else if (hasSubscribed && !subscribeModlist.includes(modID)) {
      subscribeModlist.push(modID);
      this.configs.setProfile("subscribeModlist", subscribeModlist);
      Utils.commonMsg("成功同步关注状态~");
    }
  }

  /** 各雷达图容器在首次夜间改写前捕获的原始 option 片段（日间还原用） */
  private chartOriginalOptions = new Map<HTMLElement, string>();

  /**
   * 夜间模式下的评分雷达图重主题化：站点建图代码把 ECharts 的 backgroundColor 硬编码为
   * "#FFF"、数据多边形为深灰 `#555`、填充为黑色半透明（canvas 绘制，CSS 无法覆盖），
   * 夜间模式下是一块白底 + 低对比暗线的刺眼图形。
   *
   * 同时处理贡献统计弹窗里的两个饼图（`#chart-edit` / `#chart-word`）：站点把标题、
   * 图例文字（`legend.textStyle.color: "#333"`）与 tooltip 全部写成日间配色，弹窗在
   * 夜间模式下对比度极低。
   *
   * 时序要点：`_echarts_instance_` 属性在 `echarts.init()` 时就会出现，而站点自己的
   * `setOption`（携带日间配色）在其后异步到达——若只应用一次会被覆盖。因此夜间应用后
   * 还要在若干延时点复检背景是否仍为夜间值，被覆盖就重新应用；日间按首次捕获的
   * 原始 option 片段（`getOption()` 已有内容时）原样还原，尚无内容时什么都不做
   * （站点随后到达的 setOption 本身就是日间样式）。`html` 的 `dark` 类切换同样触发。
   * 贡献统计的图表在弹窗首次打开时才创建，同样被属性观察者接住。
   */
  private setupNightChartFix() {
    /** 雷达图是否已是夜间配色（幂等标记） */
    const isRadarNight = (chart: ReturnType<typeof echarts.getInstanceByDom>) =>
      chart.getOption()?.backgroundColor === "transparent";
    /** 饼图是否已是夜间配色（幂等标记） */
    const isPieNight = (chart: ReturnType<typeof echarts.getInstanceByDom>) =>
      chart.getOption()?.legend?.[0]?.textStyle?.color === "#999";

    const applyChart = (
      id: string,
      isNightStyle: (chart: ReturnType<typeof echarts.getInstanceByDom>) => boolean,
      applyNightStyle: (chart: NonNullable<ReturnType<typeof echarts.getInstanceByDom>>) => void,
      // 捕获片段必须是 JSON 安全的纯数据：饼图的 itemStyle.color 是图案节点（内含 DOM 引用），
      // 整份 getOption() 直接 stringify 会失败，只能按需摘字段
      captureFragment: (chart: NonNullable<ReturnType<typeof echarts.getInstanceByDom>>) => object,
    ) => {
      const el = document.getElementById(id);
      if (!el || typeof echarts === "undefined") return;
      const chart = echarts.getInstanceByDom(el);
      if (!chart) return;
      const night = document.documentElement.classList.contains("dark");
      if (night) {
        if (isNightStyle(chart)) return;
        const current = chart.getOption();
        if (current && !this.chartOriginalOptions.has(el)) {
          this.chartOriginalOptions.set(el, JSON.stringify(captureFragment(chart)));
        }
        applyNightStyle(chart);
        // 站点的日间 option 可能晚于我们到达（见时序说明），安排复检补打
        for (const delay of [100, 300, 800, 2000]) {
          setTimeout(() => {
            if (document.documentElement.classList.contains("dark") && !isNightStyle(chart)) {
              applyNightStyle(chart);
            }
          }, delay);
        }
      } else {
        const original = this.chartOriginalOptions.get(el);
        if (original) {
          chart.setOption(JSON.parse(original));
          this.chartOriginalOptions.delete(el);
        }
      }
    };

    const apply = () => {
      applyChart(
        "class-rating",
        isRadarNight,
        (chart) => {
          // 强调色取自用户当前主题（夜档），线条与填充随之联动取色器
          const accent =
            getComputedStyle(document.documentElement)
              .getPropertyValue("--mcmodder-color-accent")
              .trim() || "#35c1fd";
          chart.setOption({
            backgroundColor: "transparent",
            color: [accent],
            radar: {
              splitLine: { lineStyle: { color: "rgba(255,255,255,0.3)" } },
              axisLine: { lineStyle: { color: "rgba(255,255,255,0.35)" } },
              splitArea: {
                areaStyle: { color: ["rgba(255,255,255,0.02)", "rgba(255,255,255,0.07)"] },
              },
            },
            series: [
              {
                lineStyle: { color: accent },
                itemStyle: { color: accent },
                areaStyle: { color: Utils.setColorAlpha(accent, 0.2) },
              },
            ],
          });
        },
        (chart) => {
          const current = chart.getOption();
          return {
            backgroundColor: current.backgroundColor,
            color: current.color,
            radar: current.radar,
            series: current.series,
          };
        },
      );
      for (const id of ["chart-edit", "chart-word"]) {
        applyChart(
          id,
          isPieNight,
          (chart) => {
            // 夜间配色与上游 EChartsUtils.setClassUserChartNightStyle 一致
            chart.setOption({
              title: [
                {
                  textStyle: { color: "#ccc" },
                  subtextStyle: { color: "#aaa" },
                },
              ],
              legend: [{ textStyle: { color: "#999" } }],
              tooltip: [{ backgroundColor: "#333", textStyle: { color: "#aaa" } }],
              series: [{ itemStyle: { borderColor: "#000" } }],
            });
          },
          (chart) => {
            const current = chart.getOption();
            return {
              title: current.title,
              legend: current.legend,
              tooltip: current.tooltip,
              series: [{ itemStyle: { borderColor: current.series[0].itemStyle.borderColor } }],
            };
          },
        );
      }
    };
    // 图表创建：站点给容器打上 _echarts_instance_ 属性（attributeFilter 过滤后触发极廉价）
    new MutationObserver(apply).observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ["_echarts_instance_"],
    });
    // 夜间开关：dark 类切换时重新应用
    new MutationObserver(apply).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    apply();
  }

  run() {
    $(".common-center").addClass("mcmodder-class-page");
    // 夜间图表重主题化（评分雷达图 + 贡献统计饼图；图表缺失时 apply 内部自行跳过）
    this.setupNightChartFix();
    this.isClassPage = ClassPageInit.classPageRegExp.test(this.parent.href);
    this.pageTypeName = this.isClassPage ? "模组" : "整合包";

    // 自动记忆前置Mod
    const classID = Utils.abstractLastFromURL(window.location.href, ["class", "modpack"]);
    const nClassID = Number(classID);
    const { nameNode, enameNode, abbrNode, classData } = Utils.parseClassDocument($(document));
    const className = classData.name;
    const classEname = classData.englishName;
    const classAbbr = classData.abbr;
    const modFullName = Utils.getClassFullName(className, classEname, classAbbr) || "";
    this.parent.utils.updateClassNameIDMap(modFullName, classID);

    if (this.configs.getSettings("fastCopyName")) {
      Utils.addClickCopyEvent(nameNode, this.pageTypeName + "主要名称", className);
      Utils.addClickCopyEvent(enameNode, this.pageTypeName + "次要名称", classEname);
      Utils.addClickCopyEvent(abbrNode, this.pageTypeName + "缩写名称", classAbbr);
    }

    if (this.configs.getSettings("rememberModRelation") && this.isClassPage) {
      const modDependences = this.configs.getAsNumberList("modDependences_v2", classID);
      const modExpansions = this.configs.getAsNumberList("modExpansions_v2", classID);
      const newDependences: number[] = [];
      const newExpansions: number[] = [];
      $("li.col-lg-12.relation").each((_, e) => {
        const target = $(e);
        target.find("a[data-toggle=tooltip]").each((_, a) => {
          const href = (a as HTMLAnchorElement).href;
          const id = Utils.abstractLastFromURL(href, "class");
          const name = a.textContent;
          if (id && name) this.parent.utils.updateClassNameIDMap(name, id);

          const title = target.find("span[data-toggle=tooltip]:first-child()").text();
          if (title.includes("前置Mod")) {
            newDependences.push(Utils.abstractIDFromURL(href, "class"));
          } else if (title.includes("依赖")) {
            newExpansions.push(Utils.abstractIDFromURL(href, "class"));
          }
        });
      });

      if (JSON.stringify(modDependences) != JSON.stringify(newDependences)) {
        this.configs.set("modDependences_v2", classID, newDependences);
        Utils.commonMsg("成功更新此模组前置列表~");
      }
      if (JSON.stringify(modExpansions) != JSON.stringify(newExpansions)) {
        this.configs.set("modExpansions_v2", classID, newExpansions);
        Utils.commonMsg("成功更新此模组拓展列表~");
      }
    }

    // 自动同步关注状态
    this.syncSubscribeList(nClassID);
    $(".subscribe").click(() => this.syncSubscribeList(nClassID));

    // 自动同步自定义资料类型
    let itemCustomTypeList: ItemCustomTypeList =
      this.configs.getSettings("itemCustomTypeList") ?? [];
    if (typeof itemCustomTypeList === "string") {
      this.configs.setSettings("itemCustomTypeList", Values.itemCustomTypeList);
      itemCustomTypeList = Values.itemCustomTypeList;
    }
    $(".class-item-type li")
      .filter((_, e) => !e.className.includes("mold-"))
      .each((_, e) => {
        const t = $(e).find(".text .title").text(),
          p = $(e).find(".iconfont i");
        const data: ItemType = {
          classID: nClassID,
          typeID: Number(
            $(e)
              .find("a")
              .attr("href")
              .split(classID + "-")[1]
              ?.split(".html")[0],
          ),
          text: t,
          icon: p.attr("class").slice(4),
          color: Utils.rgbToHex(p.css("color")),
        };
        if (
          !itemCustomTypeList.filter(
            (entry) =>
              entry.classID === data.classID &&
              entry.typeID === data.typeID &&
              entry.text === data.text &&
              entry.icon === data.icon &&
              entry.color === data.color,
          ).length
        ) {
          itemCustomTypeList.push(data);
          this.configs.setSettings("itemCustomTypeList", itemCustomTypeList);
          Utils.commonMsg(`成功同步自定义资料类型数据~ (${t})`);
        }
      });

    // 日志总是显示更多按钮
    $(".title")
      .filter((_, e) => e.textContent === "更新日志")
      .append(
        `<span class="more"><a href="/class/version/${classID}.html" target="_blank">更多</a><a></a></span>`,
      );

    // 禁用模组页排版
    if (
      /* this.configs.get("mcmodderUI") && */ !this.configs.getSettings(
        "disableClassDataTypesetting",
      )
    ) {
      Utils.addStyle(
        ".common-center .right .class-text-top {min-height: unset; padding-right: unset;} .mcmodder-class-page {width: 90%; margin: 0 5%; margin-top: 6em;}",
      );
      $("<div>")
        .attr("class", "mcmodder-info-right")
        .insertAfter(".class-info-left .col-lg-12:first-child()");
      $(".class-info-right").children().clone().appendTo(".mcmodder-info-right");
      const src = $(".class-info-left").attr("class", "class-info-left mcmodder-class-source-info");
      src
        .clone()
        .attr("class", "class-info-left mcmodder-class-info")
        .appendTo(".class-info-right");

      $(".common-center").append('<div class="right"><div class="class-info"></div></div>');
      $(".class-info-right").appendTo(".common-center .right .class-info");
      $(".col-lg-12.right").addClass("mcmodder-class-init");
      $(".class-text-top").css("min-height", "0");
      $(".class-text .class-info-right").remove();
      $(".common-center > .right").insertBefore(".common-center .right");
      $(".common-center > .right").remove();
      $(".mcmodder-class-info > ul > *, .common-link-frame .title")
        .contents()
        .filter((_, c) => {
          if (c.nodeType != Node.TEXT_NODE) return false;
          const text = $(c).text();
          if (
            ![
              PublicLangData.class.link.title + ":",
              PublicLangData.class.tags.title + ": ",
              PublicLangData.modpack.tags.title + ": ",
              "支持的MC版本: ",
            ].includes(text) &&
            !text.includes("作者")
          )
            return false;
          return true;
        })
        .each((_, _text) => {
          const text = $(_text);
          text.parent().find("> i").remove();
          text.replaceWith(
            `<span class="mcmodder-subtitle">${text.text().replace(":", "")}</span>`,
          );
        });
      $(".mcmodder-class-info .author .fold").remove();

      $(".col-lg-12.common-rowlist-2 li, .mcmodder-class-info .col-lg-4").each((_, c) => {
        const t = c.textContent;
        const d = t.split(t.includes("：") ? "：" : ": ");
        let htmlBuilt = false;
        if (!isNaN(Number(d[1]))) d[1] = Number(d[1]).toLocaleString();
        if (d[0] === "支持平台")
          d[1] = d[1].replace(" (JAVA Edition)", "").replace(" (Bedrock Edition)", "");
        else if (d[0] === "运作方式") {
          htmlBuilt = true;
          const a = d[1].split(", ");
          let innerHTML = "";
          let tooltipHTML = "";
          a.forEach((e, index) => {
            let svg;
            switch (e.toLowerCase()) {
              case "forge":
                svg = svgPlarformForge;
                break;
              case "fabric":
                svg = svgPlatformFabric;
                break;
              case "neoforge":
                svg = svgPlatformNeoForge;
                break;
              case "quilt":
                svg = svgPlatformQuilt;
                break;
              case "rift":
                svg = svgPlatformRift;
                break;
              case "liteloader":
                svg = svgPlatformLiteLoader;
                break;
              case "nilloader":
                svg = svgPlatformNilLoader;
                break;
              case "javaagent":
                svg = svgPlatformJavaAgent;
                break;
              default:
                svg = svgPlatformDefault;
            }
            const icon = `<img src="${svg}" />`;
            // 运作方式取自页面文本，进 HTML / 内联样式前先转义
            const loaderName = Utils.escapeHTML(a[index]);
            const loaderKey = Utils.escapeHTML(a[index].toLowerCase());
            const text = `<span class="mcmodder-loadername" style="color: var(--mcmodder-color-platform-${loaderKey})">${loaderName}</span>`;
            if (index < 3) {
              innerHTML += `<a class="mcmodder-modloader">${icon}${a.length === 1 ? text : ""}</a>`;
            } else if (index === 3) {
              innerHTML += `<span class="more">..+${a.length - index}</span>`;
            }
            tooltipHTML += `<a class="mcmodder-modloader">${icon}${text}</a>`;
          });
          d[1] = `<div class="mcmodder-modloader-container" data-toggle="tooltip" data-html="true" data-original-title="${Utils.escapeHTML(tooltipHTML)}">${innerHTML}</div>`;
        }
        if (d[0] === "运行环境") {
          const a = d[1].split(", ");
          a.forEach((e) => {
            const r = e.slice(3, 5);
            let envHTML: string;
            if (r === "需装")
              envHTML = `<span class="mcmodder-class-env-required"><i class="fa fa-check" />${Utils.escapeHTML(r)}</span>`;
            else if (r === "无效")
              envHTML = `<span class="mcmodder-class-env-invalid"><i class="fa fa-ban" />${Utils.escapeHTML(r)}</span>`;
            else if (r === "可选")
              envHTML = `<span class="mcmodder-class-env-optional"><i class="fa fa-circle-o" />${Utils.escapeHTML(r)}</span>`;
            else envHTML = Utils.escapeHTML(r);
            $(
              `<li class="col-lg-6"><span class="title">${envHTML}</span><span class="text">${Utils.escapeHTML(e.slice(0, 3))}</span></li>`,
            ).insertAfter($(c).prev());
          });
          c.remove();
        } else if (htmlBuilt) {
          // 该列由本函数生成 HTML（已转义数据），不再是页面原始文本
          c.innerHTML = d[1];
        } else {
          c.innerHTML = `<span class="title">${Utils.escapeHTML(d[1])}</span><span class="text">${Utils.escapeHTML(d[0])}</span>`;
        }
        if (c.className === "col-lg-4") c.className = "col-lg-6";
      });
      $(".slider-block").remove();
      $(".modlist-filter-block.auto button[type=submit]").css({
        background: "transparent",
        color: "var(--mcmodder-color-text)",
      });

      const infoModpack = parseInt($(".infolist.modpack").text().slice(2));
      const infoServerCount = parseInt($(".infolist.server-count").text().slice(2));
      const infoServerPre = parseFloat($(".infolist.server-pre").text().split("安装率为 ")[1]);
      const infoWorldgen = parseFloat($(".infolist.worldgen").text().split("有 ")[1]);
      const infoDownload = $(".download-btn").attr("title")?.split("共 ")[1]?.split(" 次下载")[0];
      $(
        ".infolist.modpack, .infolist.server-count, .infolist.server-pre, .infolist.worldgen",
      ).remove();
      if (infoModpack)
        $(
          `<li class="col-lg-6"><span class="title">${infoModpack}</span><span class="text"><a target="_blank" href="/modpack.html?mod=${classID}">整合包已收录</a></span></li>`,
        ).insertAfter($(".col-lg-6").last());
      if (infoServerCount)
        $(
          `<li class="col-lg-6"><span class="title">${infoServerCount}</span><span class="text"><a target="_blank" href="https://play.mcmod.cn/list/?classid=${classID}">服务器已安装</a></span></li>`,
        ).insertAfter($(".col-lg-6").last());
      if (infoServerPre)
        $(
          `<li class="col-lg-6"><span class="title">${infoServerPre}%</span><span class="text">模组服安装率</span></li>`,
        ).insertAfter($(".col-lg-6").last());
      if (infoWorldgen)
        $(
          `<li class="col-lg-6"><span class="title">${infoWorldgen}</span><span class="text"><a target="_blank" href="${this.parent.hostname}/worldgen.html?mod=${classID}">资源分布数据</a></span></li>`,
        ).insertAfter($(".col-lg-6").last());
      if (infoDownload)
        $(
          `<li class="col-lg-6"><span class="title">${infoDownload}</span><span class="text">本站下载量</span></li>`,
        ).insertAfter($(".col-lg-6").last());

      // 启用悬浮链接提示兼容
      if (src.find(".common-link-frame a").first().attr("href") === "javascript:void(0);") {
        src.find(".common-link-frame a").each((_, c) => {
          const srca = $(c);
          const cpta = $(".class-info-left.mcmodder-class-info").find("#" + srca.attr("id"));
          const url = srca.next().html().split("<strong>")[1].split("</strong>")[0];
          const jumpUrl = srca.next().html().split('href=\\"')[1].split('\\">前往链接')[0];
          cpta.webuiPopover({
            title: "这是一个站外链接",
            content: `
              <p>此链接会跳转到:</p>
              <p><strong>${url}</strong></p>
              <br/>
              <p style="word-break:break-all;">
                <a rel="nofollow noreferrer" target="_blank" href="${jumpUrl}">前往链接</a>
                <a style="float:right" class="linkTips_hide" href="javascript:void(0);">不要再提示我</a>
              </p>`,
            trigger: "click",
            closeable: true,
            delay: 0,
          });
          cpta.parent().click(() => $(".tooltip").tooltip("hide"));
        });
      }
    } else {
      Utils.addStyle(".common-center .right .class-text-top {padding-right: 250px;}");
      $(".class-info-right, .class-excount").addClass("mcmodder-disable-modern");
    }

    // maintext
    new MainText(this.parent, $(".text-area.common-text"));

    // if (this.configs.get("mcmodderUI")) {
    $(".class-item-type .mold:not(.mold-0)").each((_, c) => {
      $('<span class="mcmodder-mold-num">')
        .text(parseInt($(c).find(".count").text().slice(1)).toLocaleString())
        .css("color", $(c).find(".title").css("color"))
        .appendTo(c);
    });
    // }

    // 广告优化
    if (this.configs.getSettings("moveAds")) {
      $(".class-text .comment-ad").insertAfter($(".class-text > *").last());
    }

    // 展开高级信息
    if (this.parent.currentUID && classID) {
      $(`<a class="btn mcmodder-class-info-fold btn-outline-secondary mcmodder-content-block">
        <i class="fas fa-chevron-down"></i>
        <span>展开高级信息</span>
      </a>`)
        .click((e) => {
          const button = $(e.currentTarget);
          button.addClass("disabled");
          button.find("span").text("努力加载中...");
          button.find("i").attr("class", "fa fa-pulse fa-spinner");
          this.parent.utils
            .createRequest(
              {
                url: `${this.parent.hostname}/${this.isClassPage ? "class" : "modpack"}/edit/${classID}/`,
                method: "GET",
              },
              "展开模组高级信息",
            )
            .then((resp) => {
              if (!resp.responseXML) return;
              const doc = $(resp.responseXML);
              if (doc.find(".edit-unlogining").length) {
                if (doc.find(".edit-unlogining").text().includes("登录"))
                  Utils.commonMsg("请重新登录或在切换账号界面中退出未登录状态后再操作~", false);
                else Utils.commonMsg("受本模组/整合包区域限制，无法直接获取高级信息...", false);
                button.removeClass("disabled");
                button.find("span").text("展开高级信息");
                button.find("i").attr("class", "fas fa-chevron-down");
                return;
              }
              const infoModID = this.isClassPage ? doc.find("#class-modid").val() : undefined;
              const infoCFID = doc.find("#class-cfprojectid").val();
              const infoMRID = doc.find("#class-mrprojectid").val();
              const lastElement = $(".col-lg-6").last();
              if (infoModID)
                Utils.addClickCopyEvent(
                  $(
                    `<li class="col-lg-6"><a><span class="title">${infoModID}</span></a><span class="text">MODID</span></li>`,
                  )
                    .insertAfter(lastElement)
                    .find("a"),
                  "MODID ",
                );
              if (infoCFID)
                Utils.addClickCopyEvent(
                  $(
                    `<li class="col-lg-6"><a><span class="title">${infoCFID}</span></a><span class="text">CFID</span></li>`,
                  )
                    .insertAfter(lastElement)
                    .find("a"),
                  "CFID ",
                );
              if (infoMRID)
                Utils.addClickCopyEvent(
                  $(
                    `<li class="col-lg-6"><a><span class="title">${infoMRID}</span></a><span class="text">MRID</span></li>`,
                  )
                    .insertAfter(lastElement)
                    .find("a"),
                  "MRID ",
                );
              button.remove();
            });
        })
        .insertAfter($(".col-lg-6").last());
    }

    // 将本模组加入最近浏览中
    if (this.isClassPage && this.configs.getSettings("rememberVisitedMods")) {
      let recentlyVisitedMods = this.configs.getSettings("recentlyVisitedMods") ?? [];
      recentlyVisitedMods = recentlyVisitedMods.filter((e) => e.id !== nClassID);
      recentlyVisitedMods.push({
        id: nClassID,
        time: Date.now(),
      });
      if (recentlyVisitedMods.length > ClassPageInit.maxRecentlyVisitedLength) {
        recentlyVisitedMods = recentlyVisitedMods.slice(-ClassPageInit.maxRecentlyVisitedLength);
      }
      this.configs.setSettings("recentlyVisitedMods", recentlyVisitedMods);

      // 记录模组数据
      this.configs.setAllClass(Utils.parseClassDocument().classData, nClassID);
    }

    // 样式修复
    $(".class-excount .span")
      .first()
      .css("border-right-color", "var(--mcmodder-color-background-dark2)");

    // 若参与了活动，则为活动添加外边框
    const events = $(".class-text > span.figure");
    if (events.length) {
      const eventContainer = $('<div class="mcmodder-modjam-container">').insertBefore(
        events.first(),
      );
      events.appendTo(eventContainer);
      events
        .addClass("mcmodder-golden-alert")
        .css("width", "100%")
        .find(".figcaption")
        .css("color", "var(--mcmodder-color-text-dark1)");
    }
  }
}
