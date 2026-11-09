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
          <button disabled type="button" title="GitHub Releases 导入规划中">GitHub</button>
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
      <GenericTable
        ref="table"
        :parent="parent"
        :attr="{ id: 'mcmodder-version-menu' }"
        :column-options="columnOptions"
      />
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

type PlatformId = "cf" | "mr";

/** 平台无关的文件行（拉取层产出，匹配层再加工成 GameVersionCompareEntry） */
interface NormalizedRow {
  platform: PlatformId;
  /** 该平台的查询键（CF 数字项目 ID / MR slug），补全日志链接需要 */
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
const active = ref<PlatformId>("cf");
const queryText = ref("");
const statusText = ref("");
const querying = ref(false);
/** 各平台输入框文案与查询结果缓存（会话内有效，切换平台回显；查询按钮始终强制刷新） */
const platformText: Record<PlatformId, string> = { cf: "", mr: "" };
const resultCache: Record<PlatformId, { rows: VersionHelperRow[]; fetchedAt: number } | null> = {
  cf: null,
  mr: null,
};
const platformIds: PlatformId[] = ["cf", "mr"];

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
        // MC 版本维度校验：两侧都有有效 MC 版本时必须相交，防止跨 MC 版本错配
        const wikiMc = w.mcver.filter((m) => /^\d/.test(m));
        if (
          wikiMc.length &&
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
      platform: r.platform === "cf" ? 1 : 2,
      cfid: r.platform === "cf" ? r.projectKey : undefined,
      mrid: r.platform === "mr" ? r.projectKey : undefined,
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
    (data) => {
      const state = String(data).toLowerCase();
      return `<span class="badge versiontag versiontag-${Utils.escapeHTML(state)}">${Utils.escapeHTML(String(data))}</span>`;
    },
  ],
  displayName: "文件名称",
  gameVersions: "支持 MC 版本",
  releaseTime: [
    "发布日期",
    (data: Date | undefined) => (data ? Utils.getFormattedDate(data) : "-"),
  ],
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
        return `<span class="mcmodder-slim-danger" data-toggle="tooltip" data-original-title="与平台发布日期相差 ${diff} 天，请核对是否为同一次发布">${base} <i class="fa fa-warning"></i></span>`;
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

const modules: Record<PlatformId, PlatformModule> = { cf: cfModule, mr: mrModule };

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
              gameVersions: i.gameVersions ?? [],
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

/* ---------- 交互编排：显式的「获取 ID / 查询」，不再由聚焦事件隐式触发 ---------- */

function renderRows(rows: VersionHelperRow[]) {
  table.value!.empty();
  rows.forEach((r) => table.value!.appendData(r));
  table.value!.refreshAll();
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

/** 从资料编辑页带出登记的 CF/MR 项目 ID（显式按钮，不再聚焦即取） */
async function onFetchID() {
  setStatus("正在从资料编辑页获取项目 ID…");
  try {
    const resp = await parent.utils.createRequest(
      {
        url: `${parent.hostname}/class/edit/${document.location.href.split("/version/")[1].split(".html")[0]}/`,
        method: "GET",
      },
      "从编辑页获取 CFID/MRID",
    );
    if (!resp.responseXML) throw new Error("编辑页不可达");
    const w = $(resp.responseXML);
    const ids: Record<PlatformId, string> = {
      cf: String(w.find("#class-cfprojectid").val() ?? "").trim(),
      mr: String(w.find("#class-mrprojectid").val() ?? "").trim(),
    };
    platformText.cf = ids.cf;
    platformText.mr = ids.mr;
    queryText.value = ids[active.value];
    if (!ids.cf && !ids.mr) setStatus("资料编辑页没有登记 CF / MR 项目 ID，请手动输入或粘贴链接");
    else if (!ids[active.value])
      setStatus(`${modules[active.value].label}侧未登记项目 ID，可切换平台后重新获取`);
    else setStatus("已获取项目 ID，点击「查询」拉取列表");
  } catch (e) {
    setStatus(`获取 ID 失败：${e instanceof Error ? e.message : "编辑页不可达或未登录"}`);
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
