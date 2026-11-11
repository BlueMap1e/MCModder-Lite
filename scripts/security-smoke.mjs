/**
 * 安全回归 smoke（CI 用，无需登录态）：用真实公共页面验证「外部文本不再被当成 HTML」。
 *
 * 做法：打开真实页面 → 在注入脚本之前，把页面里用户可控的文本改成 XSS payload
 * → 注入 `dist/mcmodder-lite.user.js` → 断言 payload 没有执行、且以纯文本显示。
 *
 * 不依赖登录态；贡献榜是公共页面，适合做入口级回归。
 * 管理后台的「相关链接 / 资料类型」两类 sink 需要登录且依赖真实待审数据，
 * 仍按 `docs/release-checklist.md` 手工验证。
 *
 * 站点人机验证（数据中心 IP 常见）拦截时按 SKIPPED 退出，不判失败；
 * 真实的断言失败仍然 exit 1。
 *
 * 用法：`npm run build && node scripts/security-smoke.mjs`
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(new URL("../package.json", import.meta.url)));
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "..", "dist", "mcmodder-lite.user.js");
const PAYLOAD = '<img src=x onerror="window.__xss=1">';

function readBundle() {
  const bundle = readFileSync(DIST, "utf8");
  const requires = [...bundle.matchAll(/^\/\/ @require\s+(\S+)/gm)].map((m) => m[1]);
  return { bundle, requires };
}

function gmShim({ settings }) {
  const store = { mcmodderSettings: JSON.stringify(settings) };
  Object.assign(window, {
    GM_info: { script: { name: "MCModder-Lite", version: "security-smoke" } },
    GM_getValue: (k, d) => (k in store ? store[k] : d),
    GM_setValue: (k, v) => {
      store[k] = v;
    },
    GM_deleteValue: (k) => {
      delete store[k];
    },
    GM_addValueChangeListener: () => 0,
    GM_removeValueChangeListener: () => {},
    GM_registerMenuCommand: () => 0,
    GM_unregisterMenuCommand: () => {},
    GM_openInTab: (u) => window.open(u, "_blank"),
    GM_xmlhttpRequest: (o) => {
      fetch(o.url, { method: o.method || "GET", headers: o.headers, body: o.data })
        .then(async (r) => o.onload?.({ status: r.status, responseText: await r.text() }))
        .catch((e) => o.onerror?.(e));
      return { abort() {} };
    },
    GM_cookie: {
      list: (o, cb) => cb([], null),
      set: (o, cb) => cb(null),
      delete: (o, cb) => cb(null),
    },
    unsafeWindow: window,
  });
}

const results = [];
const check = (name, ok, detail, skipped = false) => {
  results.push({ name, ok, detail, skipped });
  console.log(`${skipped ? "SKIP" : ok ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};

/** 打开真实页面并注入构建产物；`prepare` 在注入前修改页面（模拟恶意输入）。
 * `options.waitFor`：脚本注入前等待的页面就绪选择器；`options.settings`：注入到
 * GM 垫片的设置覆盖（测「非默认值才生效的分支」必须显式传，见 HANDOFF 坑）。 */
async function runScenario(name, url, prepare, assert, { waitFor = ".rank-list-block li a.name", settings = {} } = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      bypassCSP: true,
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(gmShim, { settings: { advancedRanklist: true, ...settings } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.jQuery !== "undefined", null, {
      timeout: 30000,
    });
    const blocked = await page.evaluate(() =>
      (document.title + document.body.innerText.slice(0, 200)).includes("安全验证"),
    );
    if (blocked) {
      check(`${name}：站点安全验证`, false, "SKIPPED（安全验证页）", true);
      return;
    }
    await page.waitForSelector(waitFor, { timeout: 30000 });
    await prepare(page);
    const { bundle, requires } = readBundle();
    for (const dep of requires) await page.addScriptTag({ url: dep });
    await page.waitForTimeout(200);
    await page.addScriptTag({ content: bundle });
    await page.waitForTimeout(1500);
    await assert(page, errors);
  } catch (error) {
    check(`${name}：执行`, false, String(error).slice(0, 240));
  } finally {
    await browser.close();
  }
}

/* 1. 昵称里的 HTML 只能以纯文本出现，不能生成标签 */
await runScenario(
  "贡献榜：昵称 HTML 注入",
  "https://www.mcmod.cn/rank.html",
  async (page) => {
    await page.evaluate((payload) => {
      window.__xss = 0;
      const link = document.querySelector(".rank-list-block li a.name");
      if (link) link.textContent = payload;
    }, PAYLOAD);
  },
  async (page) => {
    const state = await page.evaluate(() => ({
      xss: window.__xss,
      text: document.querySelector(".mcmodder-ranklist-container a.me")?.textContent ?? "",
      hasPayloadElement: !!document.querySelector(".mcmodder-ranklist-container img[onerror]"),
    }));
    check("贡献榜：payload 未执行", state.xss === 0, JSON.stringify(state));
    check(
      "贡献榜：payload 以纯文本显示",
      state.text.includes("<img"),
      state.text.trim().slice(0, 40),
    );
    check("贡献榜：未生成 img[onerror]", state.hasPayloadElement === false);
  },
);

/* 2. javascript: 链接不能出现在生成结果里 */
await runScenario(
  "贡献榜：javascript: 链接",
  "https://www.mcmod.cn/rank.html",
  async (page) => {
    await page.evaluate(() => {
      window.__xss = 0;
      const first = document.querySelector(".rank-list-block li a");
      if (first) first.setAttribute("href", "javascript:window.__xss=1");
    });
  },
  async (page) => {
    const href = await page.evaluate(
      () => document.querySelector(".mcmodder-ranklist-container a.me")?.getAttribute("href") ?? "",
    );
    check(
      "贡献榜：javascript: 被替换为安全值",
      !href.toLowerCase().startsWith("javascript:"),
      href,
    );
  },
);

/* 3. 资料页矿物词典：脚本把宿主文本取出重建为链接（取出 ⇒ 重灌），
      payload 必须以纯文本重建，不得生成元素或执行 */
await runScenario(
  "资料页：矿物词典注入",
  "https://www.mcmod.cn/item/1.html",
  async (page) => {
    await page.evaluate((payload) => {
      window.__xss = 0;
      // 追加成独立条目：条目分隔符就是「,\u00a0」（见 ItemPageInit 的重建逻辑）
      document
        .querySelector(".item-dict")
        ?.append(document.createTextNode(",\u00a0" + payload + " (probe)"));
    }, PAYLOAD);
  },
  async (page) => {
    const state = await page.evaluate(() => ({
      xss: window.__xss,
      text: document.querySelector(".item-dict")?.textContent ?? "",
      payloadImg: !!document.querySelector('.item-dict img[src="x"]'),
    }));
    // 重建是否真的执行了：重建后的块以我们自己的标记串开头，否则断言会空转变绿
    check(
      "资料页矿物词典：重建已执行",
      state.text.startsWith("[矿物词典/物品标签]"),
      state.text.slice(0, 60),
    );
    check("资料页矿物词典：payload 未执行", state.xss === 0, `xss=${state.xss}`);
    check(
      "资料页矿物词典：payload 以纯文本显示",
      state.text.includes("<img"),
      state.text.slice(-90),
    );
    check("资料页矿物词典：未生成 img[onerror]", !state.payloadImg);
  },
  { waitFor: ".item-dict" },
);

/* 4. 类目页站外链接弹层：从宿主 HTML 串里抠出的 URL 落进 href 前必须过滤。
      该分支只在「恢复模组页排版」关闭时运行（默认开 = 排版生效 = 分支运行），
      故显式传 disableClassDataTypesetting: false */
await runScenario(
  "类目页：站外链接弹层注入",
  "https://www.mcmod.cn/class/1.html",
  async (page) => {
    await page.evaluate(() => {
      window.__xss = 0;
      // 脚本读取「anchor(href=void(0)+id) 的下一个兄弟元素的 html()」，从中抠
      // <strong> 文本与 href=\" 转义串。script 元素经 innerHTML 插入不会执行，
      // 但其文本序列化不转义——是复现站点 href=\" 形态的唯一通道。
      const mk = (id, strongText, jsUrl) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.setAttribute("href", "javascript:void(0);");
        a.id = id;
        const sib = document.createElement("span");
        sib.innerHTML =
          "<strong></strong>" +
          `<script>var _probe_${id}="<a href=\\"${jsUrl}\\">前往链接</a>";</script>`;
        sib.querySelector("strong").textContent = strongText;
        const target = document.createElement("span");
        target.id = id;
        target.textContent = "probe";
        li.append(a, sib, target);
        return li;
      };
      const frame = document.createElement("div");
      frame.className = "common-link-frame";
      frame.append(
        mk("mcmodder-probe-xss", '<img src=x onerror="window.__xss=1">', "javascript:window.__xss=2"),
        // 安全对照组：证明分支端到端跑通、只有恶意条目被过滤（防断言空转变绿）
        mk("mcmodder-probe-safe", "安全链接", "https://example.com/page?x=1"),
      );
      // 分支以 .first() 判定：合成 frame 必须排在站点自有 frame 之前（同一父容器内前置）
      document.querySelector(".common-link-frame")?.parentElement.prepend(frame);
    });
  },
  async (page) => {
    // 弹层 trigger 为 click。实测 cpta = 克隆列里 .find("#id") 的首个命中（即
    // anchor 本身），所以同名 id 的元素全部点一遍，绑定了的那个自然会响应
    await page.evaluate(() => {
      document.querySelectorAll("#mcmodder-probe-safe, #mcmodder-probe-xss").forEach((el) => {
        el.click();
      });
    });
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => ({
      xss: window.__xss,
      jsLink: !!document.querySelector('a[href="javascript:window.__xss=2"]'),
      safeLink: document.querySelector('a[href="https://example.com/page?x=1"]')?.getAttribute("href") ?? "",
    }));
    check("类目页站外链接：安全链接弹层正常生成", state.safeLink !== "", state.safeLink);
    check("类目页站外链接：javascript: 链接未生成", !state.jsLink);
    check("类目页站外链接：payload 未执行", state.xss === 0, `xss=${state.xss}`);
  },
  { waitFor: ".class-info-left", settings: { disableClassDataTypesetting: false } },
);

const failed = results.filter((r) => !r.ok && !r.skipped);
const skipped = results.filter((r) => r.skipped);
if (skipped.length === results.length && results.length > 0) {
  console.log("\nSKIPPED：所有场景均被站点「安全验证」拦截，本次安全回归未实际执行。");
  process.exitCode = 0;
} else {
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项，跳过 ${skipped.length} 项`);
  process.exitCode = failed.length ? 1 : 0;
}
