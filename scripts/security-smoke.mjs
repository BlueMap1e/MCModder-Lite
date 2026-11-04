/**
 * 安全回归 smoke（本地用，不接入 CI）：用真实公共页面验证「外部文本不再被当成 HTML」。
 *
 * 做法：打开真实页面 → 在注入脚本之前，把页面里用户可控的文本改成 XSS payload
 * → 注入 `dist/mcmodder-lite.user.js` → 断言 payload 没有执行、且以纯文本显示。
 *
 * 不依赖登录态；贡献榜是公共页面，适合做入口级回归。
 * 管理后台的「相关链接 / 资料类型」两类 sink 需要登录且依赖真实待审数据，
 * 仍按 `docs/release-checklist.md` 手工验证。
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
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail ?? ""}`);
};

/** 打开真实页面并注入构建产物；`prepare` 在注入前修改页面（模拟恶意输入） */
async function runScenario(name, url, prepare, assert) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      bypassCSP: true,
      viewport: { width: 1280, height: 900 },
    });
    await context.addInitScript(gmShim, { settings: { advancedRanklist: true } });
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
      check(`${name}：站点安全验证`, false, "SKIPPED");
      return;
    }
    await page.waitForSelector(".rank-list-block li a.name", { timeout: 30000 });
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

const failed = results.filter((r) => !r.ok);
console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项`);
process.exitCode = failed.length ? 1 : 0;
