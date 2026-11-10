<template>
  <div class="version-helper">
    <fieldset>
      <legend>从其他网站获取版本列表</legend>
      <div class="bd-callout">
        <p>
          该功能尚不保证能够准确对应版本列表与百科现有日志的版本号，对比结果仅供参考，提交日志前请仔细检查各信息是否正确~
        </p>
        <p>
          添加时请注意：新增日志的版本号格式应尽可能与现有日志统一。例如，若其他版本号有前缀“v”，则新建日志的版本号也应带此前缀~
        </p>
      </div>
      <div class="mcmodder-vh-bar">
        <div class="mcmodder-vh-platforms">
          <button
            v-for="p in platformIds"
            :key="p"
            :class="{ active: active === p }"
            type="button"
            @click="switchPlatform(p)"
          >
            {{ modules[p].label }}
          </button>
          <!-- GitHub 匿名额度徽章：仅 GitHub 渠道且观测到限额头时显示（按 IP 计，
               共享出口下他人用量也会占用，故数值可能无故下降——可视化以免误解） -->
          <span
            v-if="active === 'gh' && ghQuota"
            class="mcmodder-vh-quota"
            :class="{ exhausted: ghQuota.remaining === 0 }"
            :title="
              ghQuota.resetAt
                ? `匿名额度按出口 IP 计 60 次/小时，约 ${ghQuota.resetAt} 重置`
                : '匿名额度按出口 IP 计 60 次/小时'
            "
          >
            额度 {{ ghQuota.remaining }}/{{ ghQuota.limit }}
          </span>
        </div>

        <input
          v-model="queryText"
          class="form-control"
          :placeholder="modules[active].placeholder"
          @keydown.enter="onQuery"
        />
        <button
          class="btn btn-default btn-sm"
          type="button"
          :disabled="querying"
          @click="onFetchID"
        >
          获取 ID
        </button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="querying" @click="onQuery">
          查询
        </button>
      </div>
      <div v-if="statusText" class="mcmodder-vh-status">{{ statusText }}</div>
      <!-- 窄屏（页宽设置「窄屏」+ 垂直选项卡）下容器放不下整表：横向滚动替代裁切 -->
      <div class="mcmodder-vh-table-wrap">
        <GenericTable
          ref="table"
          :parent="parent"
          :attr="{ id: 'mcmodder-version-menu' }"
          :column-options="columnOptions"
          :disable-virtual="true"
        />
      </div>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { Mcmodder } from "../../Mcmodder";
import { Utils } from "../../Utils.ts";
import GenericTable from "./table/GenericTable.vue";
import { GM_openInTab } from "$";

interface Props {
  parent: Mcmodder;
}

const { parent } = defineProps<Props>();

/** 平台发布日期与百科收录日期允许的自然日差；超过才提示核对（用户裁定 1 天过窄，放宽到 7 天） */
const DATE_DIFF_WARN_DAYS = 7;
const captchaAttemptMaxLimit = 2;
const captchaAttemptInterval = 5000;

type PlatformId = "cf" | "mr" | "gh";

/** 平台无关的文件行（拉取层产出，匹配层再加工成 GameVersionCompareEntry） */
interface NormalizedRow {
  platform: PlatformId;
  /** 该平台的查询键（CF 数字项目 ID / MR slug / GitHub owner-repo），补全日志链接需要 */
  projectKey: string;
  fileID: number;
  releaseType: string;
  displayName: string;
  gameVersions: string[];
  releaseTime: Date;
}

/** 平台模块：新增平台（如 GitHub Releases）实现同一接口即可接入 */
interface PlatformModule {
  label: string;
  placeholder: string;
  /** 输入（ID 或链接）→ 查询键；失败时内部已给出提示，返回 null */
  parseInput(raw: string): Promise<string | null>;
  /** 查询键 → 文件列表；内部处理分页与人机验证，失败抛错 */
  fetchList(queryKey: string): Promise<NormalizedRow[]>;
}

type VersionHelperRow = GameVersionCompareEntry;

const table = useTemplateRef("table");
/** 首选来源设置（dropdownMenu 数值键）→ 平台 id；缺省 CurseForge（匿名额度稳定，与
 *  ConfigLoader 的默认值保持一致）。
 *  设置只决定初始平台，面板内切换仅本会话有效，不回写设置 */
const PLATFORM_BY_SETTING: Record<number, PlatformId> = { 0: "cf", 1: "mr", 2: "gh" };
const active = ref<PlatformId>(
  PLATFORM_BY_SETTING[Number(parent.utils.configs.getSettings("versionHelperPlatform"))] ?? "cf",
);
const queryText = ref("");
const statusText = ref("");
const querying = ref(false);
/** 各平台输入框文案与查询结果缓存（会话内有效，切换平台回显；查询按钮始终强制刷新） */
const platformText: Record<PlatformId, string> = { cf: "", mr: "", gh: "" };
const resultCache: Record<PlatformId, { rows: VersionHelperRow[]; fetchedAt: number } | null> = {
  cf: null,
  mr: null,
  gh: null,
};
const platformIds: PlatformId[] = ["cf", "mr", "gh"];

function setStatus(text: string) {
  statusText.value = text;
}

/* ---------- 百科侧：版本列表 DOM 快照（每次查询时重新采集） ---------- */

function getVersionList(): GameVersion[] {
  const out: GameVersion[] = [];
  $(".version-content-block").each((i, e) => {
    e.id = "mcmodder-log-" + i;
    const mcRowVer = $(e).parent().attr("data-frame") ?? "";
    const mcver = mcRowVer
      .replaceAll(" ", "")
      .split(/[\/,&\u3001]/)
      .filter(Boolean);
    const name = $(e).find(".name").text();
    const timeText = $(e).find(".time").text().trim();
    const dateKnown = Boolean(timeText) && timeText !== "未知时间";
    out.push({
      date: dateKnown ? new Date(timeText) : new Date(0),
      name,
      mcver,
      logid: i,
      dateKnown,
      // 每条日志的编辑按钮（/class/version/edit/<logid>/），匹配成功后作为「编辑日志」入口
      editLink: $(e).find(".tools .edit a").attr("href") || undefined,
    });
  });
  return out;
}

/* ---------- 共享匹配器：模组版本 + MC 版本双维，顺序无关 ---------- */

/** 打包/加载器噪音词（整词剔除，不误伤版本号数字段） */
const NOISE_TOKENS = new Set([
  "forge",
  "fabric",
  "quilt",
  "neoforge",
  "alpha",
  "beta",
  "release",
  "hotfix",
  "snapshot",
  "universal",
  "jar",
]);

/** 名称 → 版本型 token：小写、按常见分隔符切分、剥 v 前缀、剔噪音词，只保留「含点号的数字段」 */
function versionTokensOf(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\.jar$/i, "")
    .split(/[\s_/,;+()[\]~-]+/)
    .map((t) => t.replace(/^v(?=\d)/, ""))
    .filter((t) => !NOISE_TOKENS.has(t) && /^\d+(\.\d+)+$/.test(t));
}

/** 版本相等比较：按数字段逐段比较，1.4 与 1.4.0 视为相等 */
function versionEq(a: string, b: string): boolean {
  const ka = a.split(".").map((n) => Number(n) || 0);
  const kb = b.split(".").map((n) => Number(n) || 0);
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) if ((ka[i] ?? 0) !== (kb[i] ?? 0)) return false;
  return true;
}

/**
 * 从「名称 + MC 版本列表」中提取模组版本：剔除 MC 版本维度后取首个版本 token。
 * 旧实现只比「最后一个连字符段」且 MR 侧用字符类误剥字符，导致
 * 「1.21.1-1.4.2」对「v1.4.2-1.21.1」这类顺序不一致的命名全部失配。
 */
function modVersionOf(name: string, mcvers: string[]): string | null {
  const mcSet = new Set(mcvers.map((m) => m.trim().toLowerCase()).filter(Boolean));
  const tokens = versionTokensOf(name);
  const kept = tokens.filter((t) => !mcSet.has(t));
  if (kept.length) return kept[0];
  // 名称里的版本 token 全部被 MC 维度吃掉 → 没有可配的模组版本
  if (mcvers.some((m) => /^\d/.test(m))) return null;
  // MC 维度缺失（如「未分类」）：跳过经典 MC 版本段（1.x）后取首个兜底
  return tokens.find((t) => !/^1\./.test(t)) ?? tokens[0] ?? null;
}

/** 把拉取结果与百科日志做双维匹配；多命中时取收录日期与发布日期最接近的一条 */
function matchWikiLogs(rows: NormalizedRow[]): VersionHelperRow[] {
  const wiki = getVersionList();
  return rows.map((r) => {
    const fileMod = modVersionOf(r.displayName, r.gameVersions);
    let best: GameVersion | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;
    if (fileMod) {
      for (const w of wiki) {
        const wikiMod = modVersionOf(w.name, w.mcver);
        if (!wikiMod || !versionEq(fileMod, wikiMod)) continue;
        // MC 版本维度校验：两侧都有有效 MC 版本时必须相交，防止跨 MC 版本错配；
        // GitHub Releases 没有 MC 版本维度（fileMc 为空），仅按模组版本匹配
        const wikiMc = w.mcver.filter((m) => /^\d/.test(m));
        if (
          wikiMc.length &&
          r.gameVersions.length &&
          !wikiMc.some((m) =>
            r.gameVersions.some((g) => g.trim().toLowerCase() === m.toLowerCase()),
          )
        )
          continue;
        // 「未知时间」的日志只作兜底候选
        const delta = w.dateKnown
          ? Math.abs(w.date.valueOf() - r.releaseTime.valueOf())
          : Number.MAX_SAFE_INTEGER;
        if (delta < bestDelta) {
          best = w;
          bestDelta = delta;
        }
      }
    }
    const out: VersionHelperRow = {
      platform: r.platform === "cf" ? 1 : r.platform === "mr" ? 2 : 3,
      cfid: r.platform === "cf" ? r.projectKey : undefined,
      mrid: r.platform === "mr" ? r.projectKey : undefined,
      ghrepo: r.platform === "gh" ? r.projectKey : undefined,
      fileID: r.fileID,
      releaseType: r.releaseType,
      displayName: r.displayName,
      gameVersions: r.gameVersions.join(","),
      releaseTime: r.releaseTime,
      options: "",
    };
    if (best) {
      out.mcmodVer = best.name;
      out.mcmodMcver = best.mcver.join(",");
      if (best.dateKnown) {
        out.mcmodDate = best.date;
        out.dateDiffDays = Math.round(
          Math.abs(best.date.valueOf() - r.releaseTime.valueOf()) / 864e5,
        );
      }
      out.editLink = best.editLink;
    }
    return out;
  });
}

/* ---------- 表格列 ---------- */

const columnOptions = {
  fileID: "文件ID",
  releaseType: [
    "发布状态",
    // 同 releaseTime：displayRule 必须 ≥2 参数，否则规则被静默忽略
    (data, _row) => {
      const state = String(data).toLowerCase();
      return `<span class="badge versiontag versiontag-${Utils.escapeHTML(state)}">${Utils.escapeHTML(String(data))}</span>`;
    },
  ],
  displayName: "文件名称",
  gameVersions: [
    "支持 MC 版本",
    // 只展示版本号段（Client/Server/加载器等环境标记收进悬浮提示），窄屏下大幅缩短列宽
    (data, _row) => {
      const all = String(data ?? "");
      const entries = all
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const versions = entries.filter((s) => /^\d/.test(s));
      const shown = (versions.length ? versions : entries)
        .map((s) => Utils.escapeHTML(s))
        .join(", ");
      return `<span title="${Utils.escapeHTML(all)}">${shown}</span>`;
    },
  ],
  // 注意：displayRule 有「函数声明参数 >= 2 才生效」的隐性契约（见 GenericTable.renderUnit
  // 的 hasDisplayRule 判断），单参数规则会被静默忽略、单元格回落为原始值直出——
  // 旧版发布日期的英文长串正是上游单参数规则从未生效所致
  releaseTime: ["发布日期", (data, _row) => (data ? Utils.getFormattedDate(data as Date) : "-")],
  mcmodVer: [
    "对应百科日志",
    (data, row) => {
      if (!data) return `<span class="text-muted">未找到</span>`;
      return `<span title="支持版本：${Utils.escapeHTML(row.mcmodMcver ?? "-")}">${Utils.escapeHTML(data)}</span>`;
    },
  ],
  mcmodDate: [
    "收录日期",
    (data, row) => {
      if (!data) return "-";
      const base = Utils.getFormattedDate(data);
      const diff = row.dateDiffDays;
      if (diff !== undefined && diff > DATE_DIFF_WARN_DAYS)
        // 原生 title 而非 Bootstrap tooltip：动态渲染的单元格不会经过站点的 tooltip 初始化
        return `<span class="mcmodder-slim-danger" title="与平台发布日期相差 ${diff} 天，请核对是否为同一次发布">${base} <i class="fa fa-warning"></i></span>`;
      return base;
    },
  ],
  options: [
    "操作",
    (_, row) => {
      // 已匹配：给「编辑日志」入口，而不是无事可做
      if (row.editLink)
        return `<a href="${Utils.escapeHTML(row.editLink)}" target="_blank">编辑日志</a>`;
      if (!row.displayName || !row.releaseTime) return "";
      // 文件名 / 版本号来自 CurseForge / Modrinth，进 URL 查询串前必须编码
      const mcver = encodeURIComponent(String(row.gameVersions ?? ""));
      const modVer = modVersionOf(row.displayName, String(row.gameVersions ?? "").split(","));
      const ver = encodeURIComponent(modVer ?? row.displayName);
      const base = `/class/version/add/${Utils.abstractLastFromURL(window.location.href, "version")}/`;
      if (row.platform === 1)
        return `<a href="${base}?cfid=${row.cfid}&fileid=${row.fileID}&ver=${ver}&mcver=${mcver}&date=${row.releaseTime.valueOf()}" target="_blank">补全日志</a>`;
      if (row.platform === 2)
        return `<a href="${base}?mrid=${row.mrid}&fileid=${row.fileID}&ver=${ver}&mcver=${mcver}&date=${row.releaseTime.valueOf()}" target="_blank">补全日志</a>`;
      // GitHub：ghtag 即 tag_name（displayName），编辑页经 Releases API 取 Markdown 正文
      if (row.platform === 3)
        return `<a href="${base}?ghrepo=${encodeURIComponent(String(row.ghrepo ?? ""))}&ghtag=${encodeURIComponent(row.displayName)}&ver=${ver}&date=${row.releaseTime.valueOf()}" target="_blank">补全日志</a>`;
      return "";
    },
  ],
} satisfies ColumnOptionsInitializer<GameVersionCompareEntry>;

/* ---------- 平台模块 ---------- */

const cfModule: PlatformModule = {
  label: "CurseForge",
  placeholder: "输入 CFID 或粘贴 CurseForge 项目 / 文件链接",
  parseInput: async (raw) => {
    if (!/curseforge\.com\//i.test(raw)) {
      if (Number.isFinite(Number(raw))) return raw;
      Utils.commonMsg("输入既不是数字 ID 也不是 CurseForge 链接", false);
      return null;
    }
    // CF 搜索接口不对外开放，slug → 数字项目 ID 走 cfwidget 公共只读镜像；
    // 失败时保留手动填数字 ID 的路径
    let path: string;
    try {
      path = new URL(raw).pathname.split("/files/")[0];
    } catch {
      Utils.commonMsg("链接无法解析，请检查后重试，或直接填数字项目 ID", false);
      return null;
    }
    setStatus("正在解析 CF 数字项目 ID…");
    try {
      const resp = await parent.utils.createRequest(
        { url: `https://api.cfwidget.com${path}`, method: "GET" },
        "解析 CF 数字项目 ID",
      );
      const data = JSON.parse(resp.responseText) as { id?: number; message?: string };
      if (data.id) return String(data.id);
      // cfwidget 首次遇到冷门项目会排队缓存，稍后重试即可
      Utils.commonMsg(
        `CF 解析暂未就绪（${Utils.escapeHTML(String(data.message ?? "未知原因"))}），稍后重试或手动填数字 ID`,
        false,
      );
    } catch {
      Utils.commonMsg("CF 数字项目 ID 解析失败，可手动填入数字 ID 重试", false);
    }
    return null;
  },
  fetchList: (cfid) => fetchCFList(cfid),
};

const mrModule: PlatformModule = {
  label: "Modrinth",
  placeholder: "输入 MRID / slug 或粘贴 Modrinth 项目链接",
  parseInput: async (raw) => {
    if (!/modrinth\.com\//i.test(raw)) return raw;
    let segs: string[];
    try {
      segs = new URL(raw).pathname.split("/").filter(Boolean);
    } catch {
      Utils.commonMsg("链接无法解析，请检查后重试", false);
      return null;
    }
    const types = new Set(["mod", "plugin", "resourcepack", "modpack", "shader", "project"]);
    const i = segs.findIndex((s) => types.has(s.toLowerCase()));
    const slug = i >= 0 && segs[i + 1] ? segs[i + 1] : null;
    if (!slug) Utils.commonMsg("无法从链接识别 Modrinth 项目 slug，请检查链接", false);
    return slug;
  },
  fetchList: (mrid) => fetchMRList(mrid),
};

const ghModule: PlatformModule = {
  label: "GitHub",
  placeholder: "输入 owner/repo 或粘贴 GitHub 仓库链接",
  parseInput: async (raw) => {
    if (!/github\.com\//i.test(raw)) {
      // owner/repo 简写
      if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) return raw;
      Utils.commonMsg("输入既不是 owner/repo 也不是 GitHub 仓库链接", false);
      return null;
    }
    let segs: string[];
    try {
      segs = new URL(raw).pathname.split("/").filter(Boolean);
    } catch {
      Utils.commonMsg("链接无法解析，请检查后重试，或直接输入 owner/repo", false);
      return null;
    }
    // /<owner>/<repo>[/tree|releases|tags/...] 一律取前两段
    if (segs.length >= 2) return `${segs[0]}/${segs[1]}`;
    Utils.commonMsg("无法从链接识别 owner/repo，请检查链接", false);
    return null;
  },
  fetchList: (repo) => fetchGHReleases(repo),
};

const modules: Record<PlatformId, PlatformModule> = { cf: cfModule, mr: mrModule, gh: ghModule };

/** CF 文件列表：分页拉取（1s 间隔），保留站点人机验证的重试与引导 */
function fetchCFList(cfid: string): Promise<NormalizedRow[]> {
  return new Promise((resolve, reject) => {
    let fileList: NormalizedRow[] = [];
    let captchaAttempt = 0;
    const work = (index: number): void => {
      parent.utils
        .createRequest(
          {
            url: `https://www.curseforge.com/api/v1/mods/${cfid}/files?pageIndex=${index}&pageSize=50&sort=dateCreated&sortDescending=true&removeAlphas=false`,
            method: "GET",
          },
          "从 CF 获取版本列表",
        )
        .then((resp) => {
          if (resp.responseXML?.title === "Just a moment...") {
            if (captchaAttempt < captchaAttemptMaxLimit) {
              captchaAttempt++;
              setStatus(
                `等待 CF 人机验证，${captchaAttemptInterval / 1000}s 后自动重试（${captchaAttempt}/${captchaAttemptMaxLimit}）`,
              );
              setTimeout(() => work(0), captchaAttemptInterval);
            } else {
              swal
                .fire({
                  title: "验证失败",
                  text: "请手动进入 CurseForge 验证页面，并于验证成功后重试。",
                  showCancelButton: true,
                  confirmButtonText: "前往验证",
                  cancelButtonText: "取消",
                })
                .then((isConfirm) => {
                  if (isConfirm.value) GM_openInTab("https://www.curseforge.com");
                  reject(new Error("CF 人机验证未通过"));
                });
            }
            return;
          }
          const data = JSON.parse(resp.responseText) as {
            pagination: { totalCount: number };
            data: CFGameVersion[];
          };
          const releaseMap = ["-", "Release", "Beta", "Alpha"];
          fileList = fileList.concat(
            data.data.map((i) => ({
              platform: "cf" as const,
              projectKey: cfid,
              fileID: i.id,
              releaseType: releaseMap[i.releaseType] ?? "-",
              displayName: i.fileName,
              // CF 的 gameVersions 混入加载器与端类型（Client/Server/NeoForge…），
              // 只保留 MC 版本号（用户裁定）；快照号（24w14a 等非点分格式）会一并
              // 过滤——此类文件退化为仅按模组版本匹配，与 GitHub 渠道行为一致
              gameVersions: (i.gameVersions ?? []).filter((g) =>
                /^\d+\.\d+(\.\d+)?$/.test(g.trim()),
              ),
              releaseTime: new Date(i.dateCreated),
            })),
          );
          if (index === 0) {
            table.value!.loadingProgress!.setMax(Math.ceil(data.pagination.totalCount / 50));
            table.value!.loadingProgress!.show();
          }
          table.value!.loadingProgress!.setProgress(index + 1);
          if (data.pagination.totalCount > (index - 1) * 50) setTimeout(() => work(++index), 1e3);
          else {
            table.value!.loadingProgress!.hide();
            resolve(fileList);
          }
        });
    };
    work(0);
  });
}

/** MR 版本列表：单次请求，slug / 项目 ID 皆可作查询键 */
async function fetchMRList(mrid: string): Promise<NormalizedRow[]> {
  const resp = await parent.utils.createRequest(
    {
      url: `https://api.modrinth.com/v2/project/${mrid}/version`,
      method: "GET",
      anonymous: true,
    },
    "从 MR 获取版本列表",
  );
  const data = JSON.parse(resp.responseText) as MRGameVersion[];
  return data.map((i) => ({
    platform: "mr" as const,
    projectKey: mrid,
    fileID: i.id,
    releaseType: i.version_type.charAt(0).toUpperCase() + i.version_type.slice(1),
    displayName: i.version_number,
    gameVersions: i.game_versions ?? [],
    releaseTime: new Date(i.date_published),
  }));
}

/** 最近一次 GitHub 查询观测到的匿名额度状态（状态行与徽章展示用；null = 尚无数据） */
const ghQuota = ref<{ remaining: number; limit: number; resetAt: string } | null>(null);

/** 从响应头读取 GitHub 匿名额度（TM 的 responseHeaders 为 "key: value\r\n" 字符串）。
 *  头缺失（个别管理器/代理剥头）时不更新，徽章保持上次观测值。 */
function readGHQuota(resp: { responseHeaders?: string }) {
  const get = (name: string) =>
    new RegExp(`^${name}:\\s*(.*)$`, "im").exec(resp.responseHeaders ?? "")?.[1]?.trim();
  const remaining = Number(get("x-ratelimit-remaining"));
  const limit = Number(get("x-ratelimit-limit"));
  const reset = Number(get("x-ratelimit-reset"));
  if (Number.isFinite(remaining)) {
    ghQuota.value = {
      remaining,
      limit: Number.isFinite(limit) ? limit : 60,
      resetAt:
        Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toLocaleTimeString() : "",
    };
  }
}

/** GitHub Releases：公开仓库匿名可用（限额 60 次/小时，按 IP 计），单页 100 条覆盖绝大多数仓库。
 *  Releases 没有 MC 版本维度，匹配时仅按模组版本（tag）比对 */
async function fetchGHReleases(repo: string): Promise<NormalizedRow[]> {
  const resp = await parent.utils.createRequest(
    {
      url: `https://api.github.com/repos/${repo}/releases?per_page=100`,
      method: "GET",
      anonymous: true,
    },
    "从 GitHub 获取 Releases",
  );
  readGHQuota(resp);
  if (resp.status === 404) throw new Error("仓库不存在或为私有");
  if (resp.status === 403 || resp.status === 429) {
    // GitHub 的 403/429 不全是额度：代理/共享出口的按 IP 计额度被同出口他人占用、
    // abuse 检测、无 User-Agent 的管理规则拒绝等都返回 403。按响应头区分，并把
    // GitHub 的 message 带出来——「十几个小时没用仍报额度用尽」即源于按 IP 计额
    // 与共享出口（与用户的自身使用频率无关）。
    console.warn("[MCModder-Lite] GitHub 响应头：", resp.responseHeaders);
    let detail = "";
    try {
      detail = JSON.parse(resp.responseText)?.message ?? "";
    } catch {
      /* body 非 JSON（如代理/网关拦截页） */
    }
    // 双保险：限额头缺失（个别管理器/代理剥头）时以 GitHub message 兜底判定
    if (ghQuota.value?.remaining === 0 || /rate limit exceeded/i.test(detail)) {
      const resetAt = ghQuota.value?.resetAt ?? "";
      throw new Error(
        `GitHub 匿名额度已用尽（按 IP 计 60 次/小时${resetAt ? `，约 ${resetAt} 重置` : ""}）。该额度按出口 IP 统计，经由代理/共享出口访问时会被同出口的其他用户占用`,
      );
    }
    throw new Error(
      `GitHub 拒绝了请求（HTTP ${resp.status}）${detail ? `：${detail}` : "，详情见控制台"}`,
    );
  }
  const data = JSON.parse(resp.responseText) as GHRelease[];
  return data.map((i) => ({
    platform: "gh" as const,
    projectKey: repo,
    fileID: i.id,
    releaseType: i.draft ? "Draft" : i.prerelease ? "Prerelease" : "Release",
    displayName: i.tag_name,
    // Releases 无 MC 版本维度，留空 = 匹配器跳过 MC 校验、仅按模组版本（tag）比对。
    // 曾评估从 asset 文件名解析 MC 版本：mod 版本与 MC 版本同为数字点分串、歧义高，
    // 解析错误的值会让原本可匹配的行校验失败——裁定放弃（2026-11-11）
    gameVersions: [],
    releaseTime: new Date(i.published_at || i.created_at),
  }));
}

/* ---------- 交互编排：显式的「获取 ID / 查询」，不再由聚焦事件隐式触发 ---------- */

function renderRows(rows: VersionHelperRow[]) {
  // setAllData 一次性替换并刷新：全量渲染下逐行 appendData 会每行触发一次全表刷新
  table.value!.setAllData(rows);
}

async function onQuery() {
  if (querying.value) return;
  const mod = modules[active.value];
  const raw = queryText.value.trim();
  if (!raw) {
    setStatus("先输入项目 ID / 链接，或点「获取 ID」从资料编辑页带出");
    return;
  }
  querying.value = true;
  try {
    const key = await mod.parseInput(raw);
    if (!key) return;
    setStatus("正在拉取版本列表…");
    const list = await mod.fetchList(key);
    // 匹配在查询时执行：百科列表用当前 DOM 重新采集，会话中新发日志也能被看见
    const matched = matchWikiLogs(list);
    resultCache[active.value] = { rows: matched, fetchedAt: Date.now() };
    renderRows(matched);
    const hit = matched.filter((r) => r.editLink).length;
    setStatus(
      `完成：${matched.length} 个文件，匹配到百科日志 ${hit} 个（${Utils.getFormatted24hTime(new Date())}）`,
    );
  } catch (e) {
    setStatus(`查询失败：${e instanceof Error ? e.message : "未知错误"}`);
  } finally {
    querying.value = false;
  }
}

/** 获取 ID（显式按钮）：CF/MR 从资料编辑页带出登记的项目 ID；
 *  GitHub 从资料页页头的外链图标取——wiki 把外链编码成
 *  link.mcmod.cn/target/<base64>，GitHub 图标的锚点 title 为「GitHub」。
 *  任何一步取不到都**不覆盖**用户已输入的内容（非破坏性）。 */
async function onFetchID() {
  const label = modules[active.value].label;
  setStatus("正在从资料页获取项目信息…");
  try {
    if (active.value === "gh") {
      const ghRepo = await fetchGhRepoFromWiki();
      if (!ghRepo) {
        setStatus(`资料页没有 GitHub 仓库链接，已保留当前输入；可手动输入 owner/repo 或粘贴链接`);
        return;
      }
      platformText.gh = ghRepo;
      queryText.value = ghRepo;
      setStatus(`已从资料页获得 ${ghRepo}，点击「查询」拉取 Releases`);
      return;
    }
    const resp = await parent.utils.createRequest(
      {
        url: `${parent.hostname}/class/edit/${document.location.href.split("/class/version/")[1]?.split(".html")[0]}/`,
        method: "GET",
      },
      "从编辑页获取 CFID/MRID",
    );
    if (!resp.responseXML) throw new Error("编辑页不可达");
    const w = $(resp.responseXML);
    const ids = {
      cf: String(w.find("#class-cfprojectid").val() ?? "").trim(),
      mr: String(w.find("#class-mrprojectid").val() ?? "").trim(),
    };
    if (ids.cf) platformText.cf = ids.cf;
    if (ids.mr) platformText.mr = ids.mr;
    const got = ids[active.value as "cf" | "mr"];
    if (!got) {
      const other =
        active.value === "cf"
          ? ids.mr
            ? "（MR 侧有记录，可切换平台）"
            : ""
          : ids.cf
            ? "（CF 侧有记录，可切换平台）"
            : "";
      setStatus(`${label}侧未登记项目 ID${other}，已保留当前输入；可手动输入或粘贴链接`);
      return;
    }
    queryText.value = got;
    setStatus("已获取项目 ID，点击「查询」拉取列表");
  } catch (e) {
    setStatus(
      `获取失败：${e instanceof Error ? e.message : "编辑页不可达或未登录"}（已保留当前输入）`,
    );
  }
}

/** 从资料页页头外链解析 GitHub 仓库（owner/repo）：
 *  锚点形如 <a title="GitHub" href="//link.mcmod.cn/target/<base64>">，
 *  base64 解码后为 GitHub 仓库地址，取其 pathname 前两段 */
async function fetchGhRepoFromWiki(): Promise<string | null> {
  const classId = document.location.href.split("/class/version/")[1] ?? "";
  if (!classId) return null;
  const resp = await parent.utils.createRequest(
    { url: `${parent.hostname}/class/${classId}`, method: "GET" },
    "从资料页获取 GitHub 链接",
  );
  if (!resp.responseXML) return null;
  const anchors = $(resp.responseXML).find(
    "a[data-original-title='GitHub'][href*='link.mcmod.cn/target/'], a[title='GitHub'][href*='link.mcmod.cn/target/']",
  );
  const href = anchors.first().attr("href");
  if (!href) return null;
  let b64 = href.split("/target/")[1] ?? "";
  try {
    // 兼容 URL-safe 变体与缺失的末尾填充
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "===".slice((b64.length + 3) % 4);
    const decoded = atob(b64);
    const url = new URL(decoded);
    if (!/(^|\.)github\.com$/.test(url.hostname)) return null;
    const segs = url.pathname.split("/").filter(Boolean);
    return segs.length >= 2 ? `${segs[0]}/${segs[1]}` : null;
  } catch {
    return null;
  }
}

function switchPlatform(p: PlatformId) {
  if (p === active.value) return;
  platformText[active.value] = queryText.value;
  active.value = p;
  queryText.value = platformText[p];
  const cached = resultCache[p];
  if (cached) {
    renderRows(cached.rows);
    setStatus(
      `会话缓存（${Utils.getFormatted24hTime(new Date(cached.fetchedAt))}），点「查询」强制刷新`,
    );
  } else {
    table.value?.empty();
    setStatus(`已切换到 ${modules[p].label}：输入 ID / 链接后点「查询」`);
  }
}
</script>

<style lang="css">
/* 窄屏兼容：容器放不下时横向滚动而不是截断列 */
.mcmodder-vh-table-wrap {
  overflow-x: auto;
}
.mcmodder-vh-table-wrap table {
  min-width: 860px;
}
/* 可读性：行底用中性面板色统一抬升（不用主题色染色，避免随主题变暖/变蓝整体发色），
   主题色只出现在悬停焦点上；行间用细分隔线保持可扫读性。
   仅作用于此表的实例 id，不影响其它 GenericTable（编辑表格等）的既有观感 */
#mcmodder-version-menu tr:not(.mcmodder-table-empty) {
  background-color: var(--mcmodder-color-background-dark2);
}
#mcmodder-version-menu tbody td {
  padding: 6px 8px;
  line-height: 1.55;
  border-bottom: 1px solid var(--mcmodder-color-background-dark3);
}
#mcmodder-version-menu tbody tr:hover > td {
  background-color: var(--mcmodder-color-primary-transparent1);
}
.mcmodder-vh-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.mcmodder-vh-bar .form-control {
  flex: 1 1 240px;
  min-width: 180px;
}
.mcmodder-vh-platforms {
  display: inline-flex;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 4px;
  overflow: hidden;
}
/* GitHub 匿名额度徽章：按 IP 计、共享出口下他人用量也会占用，数值可能无故
   下降——可视化以免误解；耗尽态用警示色标出 */
.mcmodder-vh-quota {
  align-self: center;
  font-size: 12px;
  opacity: 0.75;
  padding: 2px 8px;
  white-space: nowrap;
}
.mcmodder-vh-quota.exhausted {
  color: var(--mcmodder-color-danger, #d9534f);
  opacity: 1;
}
.mcmodder-vh-platforms button {
  border: none;
  background: transparent;
  color: inherit;
  padding: 5px 12px;
  cursor: pointer;
}
.mcmodder-vh-platforms button + button {
  border-left: 1px solid rgba(128, 128, 128, 0.45);
}
.mcmodder-vh-platforms button.active {
  background: var(--mcmodder-color-primary, #1e88e5);
  color: #fff;
}
.mcmodder-vh-platforms button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.mcmodder-vh-status {
  font-size: 12px;
  opacity: 0.85;
  margin: 4px 0;
}
</style>
