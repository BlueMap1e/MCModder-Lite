/**
 * 公共页 smoke 测试（CI 用，无需登录态与密钥）。
 *
 * 不依赖 Tampermonkey：用 Playwright 打开真实 mcmod.cn 公共页面，注入一份 GM API 垫片，
 * 再把 `dist/mcmodder-lite.user.js` 当作普通脚本注入页面 realm 执行。
 * 编辑页 E2E 依赖登录态，仍留在本地 harness（不随仓库提交）。
 *
 * 用法：先 `npm run build`，再 `node scripts/smoke-public.mjs`。
 * 需要浏览器二进制：`npx playwright install chromium`（CI 里加 --with-deps）。
 *
 * 已知局限（与本地 harness 相同）：GM_getValue/GM_setValue 是页面内存里的同步实现；
 * GM_xmlhttpRequest 走 fetch，跨域请求受 CORS 限制（公共页 smoke 不涉及）。
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(fileURLToPath(new URL("../package.json", import.meta.url)));
const { chromium } = require("playwright");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "..", "dist", "mcmodder-lite.user.js");

/** 读取构建产物与其 @require 依赖列表 */
function readBundle() {
  const bundle = readFileSync(DIST, "utf8");
  const requires = [...bundle.matchAll(/^\/\/ @require\s+(\S+)/gm)].map((m) => m[1]);
  return { bundle, requires };
}

/** GM API 垫片：在页面 realm 里提供脚本需要的全局（精简自本地 harness.mjs） */
function gmShim({ settings }) {
  const store = { mcmodderSettings: JSON.stringify(settings) };
  Object.assign(window, {
    GM_info: {
      script: { name: "MCModder-Lite", version: "smoke" },
      scriptHandler: "playwright-shim",
    },
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
        .then(async (r) => {
          const text = await r.text();
          o.onload?.({ status: r.status, responseText: text, response: text, finalUrl: r.url });
        })
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

/**
 * 站点人机验证检测：mcmod.cn 对高频/数据中心来源的访问会弹「安全验证」算式验证页，
 * 此时任何断言都无法进行。全部场景都被拦截时按 SKIPPED 退出（CI 不假红），
 * 部分被拦截只记 FAIL，让能跑的场景照常门禁。
 */
function isBlocked(page) {
  return page.evaluate(() =>
    (document.title + document.body.innerText.slice(0, 200)).includes("安全验证"),
  );
}

/**
 * 打开页面、等 jQuery 就绪后注入 @require 与脚本本体，返回断言用的页面状态。
 * 门禁只看 pageerror（脚本/页面抛出的未捕获异常）；console.error 只记录不判失败，
 * 避免站点第三方资源偶发加载失败造成 CI 误报。
 */
async function runScenario(name, url, { settings = {}, after } = {}) {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  // 屏蔽广告开启时，AdSense 会向被隐藏的零宽槽位填充并抛 adsbygoogle.push() error。
  // 这是该功能的预期副作用：放行但计数，输出里明示，不静默吞掉。
  let suppressedAdErrors = 0;
  try {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
    await context.addInitScript(gmShim, { settings });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      if (settings.blockAds !== false && /adsbygoogle\.push\(\) error/.test(e.message)) {
        suppressedAdErrors++;
        return;
      }
      errors.push("pageerror: " + e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof window.jQuery !== "undefined", null, { timeout: 30000 });
    if (await isBlocked(page)) {
      check(`${name}：被站点人机验证拦截`, false, "SKIPPED（安全验证页）", true);
      return {};
    }
    const { bundle, requires } = readBundle();
    for (const dep of requires) await page.addScriptTag({ url: dep });
    await page.waitForTimeout(200);
    await page.addScriptTag({ content: bundle });
    const state = await after(page);
    check(
      `${name}：无未捕获异常`,
      errors.filter((e) => e.startsWith("pageerror")).length === 0,
      JSON.stringify(errors.slice(0, 3)),
    );
    if (suppressedAdErrors > 0) {
      console.log(
        `（已放行 ${suppressedAdErrors} 条 AdSense 零宽槽位报错——屏蔽广告的预期副作用，非脚本异常）`,
      );
    }
    return state;
  } catch (error) {
    check(`${name}：场景执行`, false, String(error).slice(0, 300));
    return {};
  } finally {
    await browser.close();
  }
}

/* 首页：无标准页头的布局下脚本也要能正常启动（不挂页头按钮、不抛异常），
   顺带验「屏蔽 AdSense」的标记与可见性（blockAds 默认开） */
await runScenario("首页", "https://www.mcmod.cn/", {
  after: async (page) => {
    await page.waitForTimeout(3000);
    const ad = await page.evaluate(() => ({
      marker: document.documentElement.classList.contains("mcmodder-block-ads"),
      visibleAds: [...document.querySelectorAll("ins.adsbygoogle")].filter(
        (el) => el.getClientRects().length > 0,
      ).length,
      textLen: (document.body.innerText || "").length,
    }));
    check("首页：屏蔽广告标记挂载", ad.marker, JSON.stringify(ad));
    check("首页：无可见 AdSense 槽位", ad.visibleAds === 0, `visible=${ad.visibleAds}`);
    check("首页：正文未被广告规则误伤", ad.textLen > 200, `textLen=${ad.textLen}`);
  },
});

/* 公共资料页：页头夜间开关挂载，点击后整页进入夜间模式
   （夜间开关在 `adaptableNightMode` 开启时会隐藏，故显式关掉它） */
await runScenario("资料页", "https://www.mcmod.cn/item/440.html", {
  settings: { adaptableNightMode: false },
  after: async (page) => {
    await page.waitForSelector("#mcmodder-night-switch", { timeout: 20000 });
    await page.click("#mcmodder-night-switch");
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), null, {
      timeout: 10000,
    });
    check("资料页：夜间开关切换 dark 类", true);
  },
});

/* 公共模组页：以配置直接进入夜间模式，类目页增强与雷达图重主题化生效 */
await runScenario("模组类目页", "https://www.mcmod.cn/class/1.html", {
  settings: { nightMode: true, adaptableNightMode: false },
  after: async (page) => {
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"), null, {
      timeout: 15000,
    });
    check("模组类目页：夜间模式", true);
    const s = await page.waitForFunction(
      () => ({
        classPage: document.querySelectorAll(".mcmodder-class-page").length,
        radar: (() => {
          const el = document.getElementById("class-rating");
          if (!el || typeof window.echarts === "undefined") return "pending";
          const chart = window.echarts.getInstanceByDom(el);
          return chart ? chart.getOption().backgroundColor : "none";
        })(),
      }),
      null,
      { timeout: 20000, polling: 500 },
    );
    const state = s.jsonValue ? await s.jsonValue() : s;
    check("模组类目页：类目页增强挂载", state.classPage === 1, JSON.stringify(state));
    check("模组类目页：雷达图重主题", state.radar === "transparent", JSON.stringify(state));
  },
});

const failed = results.filter((r) => !r.ok && !r.skipped);
const skipped = results.filter((r) => r.skipped);
if (skipped.length === results.length && results.length > 0) {
  // 整个站点被人机验证拦住：本次 smoke 未执行，CI 记为通过并给出醒目提示
  console.log("\nSKIPPED：所有场景均被站点「安全验证」拦截，本次 smoke 未实际执行。");
  process.exitCode = 0;
} else {
  console.log(`\n共 ${results.length} 项，失败 ${failed.length} 项，跳过 ${skipped.length} 项`);
  process.exitCode = failed.length ? 1 : 0;
}
