#!/usr/bin/env node
/**
 * 发版打包工具：两遍构建（压缩产物 + GF 未压缩变体）→ 按版本号命名 →
 * 标准 Deflate zip → dist/release/
 *
 * 用法：npm run pack
 *
 * 产物（dist/ 整体在 .gitignore 内，不会入库）：
 *   dist/release/mcmodder-lite.user-<版本号>.js            压缩产物（TM / 帖内 zip）
 *   dist/release/mcmodder-lite-<版本号>.zip                内含上述 js（Deflate 压缩）
 *   dist/release/mcmodder-lite.user-<版本号>.unminified.js GF 未压缩变体（手动上传）
 *
 * 版本号取自 package.json（唯一事实源）；若与 vite.config.ts 的 userscript
 * 元数据版本不一致会拒绝打包——两者必须同步 bump，否则 CI 的 tag 会变成
 * vX_2 且 release notes 为空（见 docs/release-checklist.md）。
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

// fileURLToPath 而非手拼 URL.pathname：路径含空格/中文时 pathname 是百分号编码，
// 直接拼接会拼出不存在的路径
const root = fileURLToPath(new URL("..", import.meta.url));

/* ---------- 版本号一致性与读取 ---------- */

const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
const version = pkg.version;
const viteSrc = readFileSync(`${root}vite.config.ts`, "utf8");
const viteVersion = viteSrc.match(/version:\s*"([^"]+)"/)?.[1];
if (viteVersion !== version) {
  console.error(
    `版本号不一致：package.json 为 ${version}，vite.config.ts（userscript 元数据）为 ${viteVersion}。\n` +
      `两个文件必须同步 bump 后再打包，否则发版会打出错误的 tag 与空的 release notes。`,
  );
  process.exit(1);
}

/* ---------- 构建（两遍，产物各自落盘互不覆盖） ---------- */

console.log("构建压缩产物（TM / 帖内 zip）…");
execSync("npm run build", { cwd: root, stdio: "inherit" });
const jsMin = readFileSync(`${root}dist/mcmodder-lite.user.js`);

console.log("构建未压缩变体（GF_UNMINIFIED=1，GreasyFork 提交用）…");
execSync("npm run build", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, GF_UNMINIFIED: "1" },
});
const jsRaw = readFileSync(`${root}dist/mcmodder-lite.user.js`);

/* ---------- 命名与落盘 ---------- */

const outDir = `${root}dist/release/`;
mkdirSync(outDir, { recursive: true });
const jsName = `mcmodder-lite.user-${version}.js`;
const rawName = `mcmodder-lite.user-${version}.unminified.js`;
writeFileSync(`${outDir}${jsName}`, jsMin);
writeFileSync(`${outDir}${rawName}`, jsRaw);

/* ---------- 最小 zip 容器（PKZIP：单文件 + Deflate） ----------
   zip 是标准格式：本地文件头 + 数据 + 中央目录 + 结束记录。Deflate 数据由
   zlib.deflateRawSync 给出（不带 zlib 头尾的裸 deflate，即 zip 的 method 8）。 */

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zipOne(name, data) {
  const deflated = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBytes = Buffer.from(name, "utf8");
  // DOS 时间取当前时刻（打包时间，仅供文件管理器显示）
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2) & 0x1f);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
  local.writeUInt16LE(20, 4); // 解压所需版本
  local.writeUInt16LE(0x0800, 6); // 标志位：UTF-8 文件名
  local.writeUInt16LE(8, 8); // method 8 = Deflate
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // 中央目录签名
  central.writeUInt16LE(20, 4); // 打包版本
  central.writeUInt16LE(20, 6); // 解压版本
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42); // 本地头相对偏移（单文件紧跟 0）

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // 结束记录签名
  eocd.writeUInt16LE(1, 8); // 条目数
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBytes.length, 12); // 中央目录大小
  eocd.writeUInt32LE(30 + nameBytes.length + deflated.length, 16); // 中央目录偏移

  return Buffer.concat([local, nameBytes, deflated, central, nameBytes, eocd]);
}

const zipName = `mcmodder-lite-${version}.zip`;
const zip = zipOne(jsName, jsMin);
writeFileSync(`${outDir}${zipName}`, zip);

const kb = (n) => (n / 1024).toFixed(1);
console.log(`打包完成（版本 ${version}）：`);
console.log(`  dist/release/${jsName}  ${kb(jsMin.length)} KB（压缩产物，帖内 zip 用）`);
console.log(`  dist/release/${zipName}  ${kb(zip.length)} KB（zip / Deflate，内含上述 js）`);
console.log(`  dist/release/${rawName}  ${kb(jsRaw.length)} KB（GF 未压缩变体，手动上传）`);
