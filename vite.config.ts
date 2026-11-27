import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import monkey from "vite-plugin-monkey";

// 开发期补丁：让 Firefox 的 Private Network Access 预检通过。
// 宿主页面是 https://*.mcmod.cn（公网源），dev server 在 http://127.0.0.1（本地地址空间），
// Firefox 会先发一个 OPTIONS 预检并要求响应带 `Access-Control-Allow-Private-Network: true`，
// 预检失败就表现为「已拦截跨源请求…（原因：CORS 请求未能成功）。状态码：(null)」。
// vite 自带的 cors 中间件在插件的 configureServer 钩子之前注册，并会直接结束预检请求，
// 所以 vite-plugin-monkey 里设置该响应头的中间件来不及生效（只对非预检请求有效）。
// 这里把预检响应插到 cors 中间件之前，仅在 serve 模式生效。
const devPrivateNetworkAccess: Plugin = {
  name: "dev-private-network-access",
  apply: "serve",
  configureServer(server) {
    server.middlewares.stack.unshift({
      route: "",
      handle(req, res, next) {
        if (req.method !== "OPTIONS") return next();
        res.setHeader("access-control-allow-origin", "*");
        res.setHeader("access-control-allow-methods", "GET,HEAD,OPTIONS");
        res.setHeader(
          "access-control-allow-headers",
          req.headers["access-control-request-headers"] ?? "*",
        );
        res.setHeader("access-control-max-age", "86400");
        res.setHeader("access-control-allow-private-network", "true");
        res.statusCode = 204;
        res.end();
      },
    });
  },
};

// 用户脚本元数据单独提出来：dev 期要用它算哈希给客户端模块打缓存戳（见下方说明）。
const userscriptMeta = {
  name: "MCModder-Lite",
  author: "BlueMap1e (based on Mcmodder by Charcoal-Black)",
  version: "2.4.3-lite.3",
  description: "MCModder-Lite：MC 百科轻量编审脚本（AGPL-3.0）",
  license: "AGPL-3.0",
  homepageURL: "https://github.com/BlueMap1e/MCModder-Lite",
  supportURL: "https://github.com/BlueMap1e/MCModder-Lite/issues",
  // 指向 GitHub Release 的「最新版」附件，篡改猴据此自动检查/下载更新；
  // CI 的 release job 会把构建产物以固定文件名 mcmodder-lite.user.js 传到每个 Release。
  updateURL:
    "https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js",
  downloadURL:
    "https://github.com/BlueMap1e/MCModder-Lite/releases/latest/download/mcmodder-lite.user.js",
  icon: "https://www.mcmod.cn/static/public/images/favicon.ico",
  // namespace 必须与上游 Mcmodder（同为 http://www.mcmod.cn/）不同：TM 以
  // namespace+name 认脚本，同空间会导致安装/更新身份在两个脚本间漂移，
  // 设置存储随之串仓（2026-11-07 事故）。发版后旧用户需删除旧条目重装一次。
  namespace: "https://github.com/BlueMap1e/MCModder-Lite",
  "run-at": "document-start",
  match: ["https://*.mcmod.cn/*"],
  exclude: [
    "https://i.mcmod.cn/*",
    "https://api.mcmod.cn/*",
    "https://www.mcmod.cn/v2/*",
    "https://play.mcmod.cn/add/*",
    // 注意：不要排除 https://www.mcmod.cn/tools/*/* —— 实用工具页（成就生成器、命令方块
    // 指令生成器等 7 个）与主站共用页头和全局夜间调色板，脚本挂载即可生效。
    // 该排除规则继承自上游 1.x，曾导致工具页完全不挂载（2026-11-06 移除）。
    "https://*.mcmod.cn/ueditor/*",
    "https://www.mcmod.cn/script/*",
    "https://www.mcmod.cn/item/aspects/*",
  ],
  grant: [
    "unsafeWindow",
    "GM_cookie",
    "GM_registerMenuCommand",
    "GM_openInTab",
    "GM_setValue",
    "GM_getValue",
    "GM_addValueChangeListener",
    "GM_xmlhttpRequest",
  ],
  connect: [
    "mcmod.cn",
    "www.curseforge.com",
    "api.modrinth.com",
    "api.cfwidget.com",
    "api.github.com",
  ],
} as const;

/** 32 位 FNV-1a 哈希，用于给 dev 期模块 URL 打缓存戳 */
const hashString = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

/**
 * dev 期缓存击穿：vite-plugin-monkey 的 dev 客户端（`vite-plugin-monkey/dist/client`）里写死了
 * `__MONKEY_WINDOW_KEY__` —— 那是「用户脚本注释块」的哈希。Tampermonkey 沙箱与页面 realm 靠它对齐：
 * 已安装的脚本执行 `document[该 key] = 沙箱 window`，实时下发的客户端则按同一个 key 去取 GM API。
 *
 * 只要改了 userscript 元数据（@require / @match / @grant …），哈希就会变。可 Vite 的依赖预打包把
 * 该文件钉死在 `?v=<预打包 hash>` 这个 URL 上（该 hash 只由 lockfile 与部分配置决定，**不含**
 * userscript 元数据），响应头还是 `Cache-Control: max-age=31536000,immutable` —— URL 不变而内容变了，
 * 浏览器便一直沿用旧副本，于是「已安装脚本」与「实时模块」对不上号：
 * `GM_info` / `GM_getValue` 等**全部**变成 undefined（不报错、极难排查，重装脚本与重启 dev 都无效，
 * 只能硬刷新）。
 *
 * 这里把客户端里写死的 key 查找改成**运行时动态查找**（扫 document 上 `__monkeyWindow-` 前缀的属性），
 * 于是即便浏览器还在用旧副本，它也能找到当前已安装脚本挂上来的沙箱 window，问题自愈。
 *
 * 另外把插件名带上元数据哈希：Vite 计算依赖预打包 hash 时会算上插件名列表，改名即换 hash，
 * 客户端模块的 URL 随之变化，浏览器便不会继续沿用旧副本。
 */
const devMonkeyClientCacheBust: Plugin = {
  name: `dev-monkey-client-cache-bust-${hashString(JSON.stringify(userscriptMeta))}`,
  apply: "serve",
  enforce: "post",
  transform(code, id) {
    if (!id.includes("/node_modules/.vite/deps/")) return null;
    if (!code.includes("__monkeyWindow-")) return null;
    return {
      code: code.replace(
        /document\["__monkeyWindow-[^"]+"\]/,
        `(() => { const k = Object.keys(document).find((x) => x.startsWith("__monkeyWindow-")); return k ? document[k] : undefined; })()`,
      ),
      map: null,
    };
  },
};

/**
 * 构建期压缩以 `?raw` 引入的 `src/css/*.css`（base / bbs / mcmodderUI 等）。
 *
 * 这批 CSS 走 `?raw` 以字符串形态进产物（StyleLoader / main.ts 注入 style 元素用），
 * 不经 vite 对普通 css 的压缩管线，注释与空白原样进包——base.css 一家就有大量教学
 * 注释。仓库源文件保持可读（教学注释留在 src），仅产物瘦身。
 *
 * 刻意不用 esbuild CSS 压缩（2026-11-17 实测裁定）：它会把同体规则跨位置合并，
 * bbs.css 的 `html.dark .tl tr:hover th/td` 双份规则正是靠「第二份写在置顶行规则
 * 之后」压住悬停底色——合并后置顶行规则反超，悬停置顶行底色真实改变（级联顺序
 * 被改写，且仅产物内变，源码无痕）。本函数只做两件事：删注释、把空白串收敛成
 * 单个空格——不合并规则、不改写任何声明，级联顺序与源码逐一对应。
 * 字符串感知：引号内（content/属性选择器值）不做任何处理。
 *
 * 顺带把 AGENTS.md 的铁律「src/css 里不得出现字面 style 标签」变成构建期断言：
 * Utils.addStyle 走 jQuery .html()，字面 style 标签会把整张样式表截断成两半。
 */
const minifyRawCss: Plugin = {
  name: "mcmodder-minify-raw-css",
  enforce: "pre",
  load(id) {
    if (!/\/src\/css\/[^?]+\.css\?raw$/.test(id.replaceAll("\\", "/"))) return null;
    const css = readFileSync(id.split("?")[0], "utf8");
    let out = "";
    let inStr: string | null = null;
    for (let i = 0; i < css.length;) {
      const c = css[i];
      if (inStr) {
        out += c;
        if (c === "\\") {
          out += css[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (c === inStr) inStr = null;
        i++;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = c;
        out += c;
        i++;
        continue;
      }
      if (c === "/" && css[i + 1] === "*") {
        const end = css.indexOf("*/", i + 2);
        if (end < 0) break;
        i = end + 2;
        out += " ";
        continue;
      }
      if (/\s/.test(c)) {
        let j = i;
        while (j < css.length && /\s/.test(css[j])) j++;
        out += " ";
        i = j;
        continue;
      }
      out += c;
      i++;
    }
    if (/<\/?style[\s>]/i.test(out)) {
      throw new Error(`[mcmodder-minify-raw-css] ${id} 压缩后出现字面 style 标签，构建中止`);
    }
    return `export default ${JSON.stringify(out)}`;
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  // GreasyFork 要求用户脚本不得混淆或压缩：GF_UNMINIFIED=1 时产出未压缩变体，
  // 供向 GreasyFork 提交使用；正常构建保持 esbuild 压缩不变。
  build: {
    minify: process.env.GF_UNMINIFIED ? false : "esbuild",
    rollupOptions: {
      output: {
        // userscript 是单文件分发：源码里的动态 import()（markdown-it）会被 rollup
        // 裂成独立 chunk，不内联的话 chunk 不会进产物，真机 TM 桥接域把它相对解析
        // 到页面 URL 下必 404（2026-11-17 真机发现：MD 编辑器转换未处理异常刷屏）。
        // harness 无 TM 沙箱桥接，探不出此病——动态 import 改动必须真机点一次。
        // 内联后语义不变：模块工厂仍在首次 import() 时才求值。
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    devPrivateNetworkAccess,
    devMonkeyClientCacheBust,
    minifyRawCss,
    vue(),
    monkey({
      entry: "src/main.ts",
      userscript: userscriptMeta,
      build: {
        cssSideEffects: (css) => {
          const style = document.createElement("style");
          style.setAttribute("data-mcmodder-vue-css", "");
          style.textContent = css;
          (document.head || document.documentElement).appendChild(style);
        },
      },
    }),
  ],
});
