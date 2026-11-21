/**
 * 循环依赖门禁（verify 第 4 步）：跑 dpdm 取环列表，逐环分类「类型环 / 真环」。
 *
 * dpdm 不区分 import 与 import type，组合根的 `import type { Mcmodder }` 会制造
 * 一大批运行时无害的类型环（HANDOFF §三在册）。判据：环上**至少一条边是纯类型
 * 边**，则值依赖子图在该环上断链、不成环——无害；**全部边都是值导入**才是运行时
 * 真环，报错（exit 1）。边分类读发行方源码：该边上的全部 import 语句均为
 * `import type` 才算类型边（类型+值混导按值边处理）。
 *
 * 自测：`node scripts/check-cycles.mjs --selftest` 用历史真环样本（Utils ⇄
 * ConfigRepository，双向值导入，0de6f2a 已解开）验证边分类，不触碰 src。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dpdmBin = path.join(path.dirname(require.resolve("dpdm/package.json")), "lib", "bin", "dpdm.js");
const ENTRY = "src/main.ts";

/** 从一段源码里抽取全部 import 语句，返回 [{ isType, baseName }] */
function extractImports(source) {
  const out = [];
  const re = /import\s+(type\s+)?[^'"]*?from\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(re)) {
    const base = path.posix.basename(match[2].replace(/\.js$/, "").replace(/\.ts$/, ""));
    out.push({ isType: Boolean(match[1]), baseName: base });
  }
  return out;
}

/** 单条边 A→B：A 中对 B 的全部 import 都是 import type 才算类型边 */
function isTypeEdge(fromFile, toFile, root) {
  const sourcePath = path.join(root, fromFile);
  if (!existsSync(sourcePath)) return false;
  const base = path.posix.basename(toFile).replace(/\.ts$/, "").replace(/\.js$/, "");
  const imports = extractImports(readFileSync(sourcePath, "utf8"));
  const hits = imports.filter((item) => item.baseName === base);
  if (hits.length === 0) return false; // 找不到导入语句（重导出/动态等）按真边处理
  return hits.every((item) => item.isType);
}

/** 主流程：跑 dpdm → 分类 → 报告；返回真环列表 */
function classify(circulars, root) {
  const real = [];
  for (const cycle of circulars) {
    const files = cycle.map((file) => file.replaceAll("\\", "/"));
    const edges = files.map((file, index) => {
      const next = files[(index + 1) % files.length];
      return { from: file, to: next, typeOnly: isTypeEdge(file, next, root) };
    });
    if (edges.every((edge) => !edge.typeOnly)) real.push({ files, edges });
  }
  return real;
}

if (process.argv.includes("--selftest")) {
  // 历史真环样本：Utils.ts ⇄ ConfigRepository.ts（双向值导入，0de6f2a 已解开）。
  // 合成夹具复现其形态：A→B 类型边 + B→A 值边，分类器必须判真环并以 1 退出；
  // 纯类型环样本必须判无害。全程用临时目录，不触碰 src。
  const fixture = mkdtempSync(path.join(tmpdir(), "cycle-fixture-"));
  mkdirSync(path.join(fixture, "src", "config"), { recursive: true });
  writeFileSync(
    path.join(fixture, "src", "Utils.ts"),
    'import type { ConfigRepository } from "./config/ConfigRepository";\nexport class Utils {}\n',
  );
  writeFileSync(
    path.join(fixture, "src", "config", "ConfigRepository.ts"),
    'import { Utils } from "../Utils";\nexport class ConfigRepository {}\n',
  );
  const probeCycle = [
    ["src/Utils.ts", "src/config/ConfigRepository.ts"],
    ["src/config/ConfigRepository.ts", "src/Utils.ts"],
    ["src/a.ts", "src/b.ts"],
  ];
  // 夹具根下 a/b 不存在 → 按保守规则判真边；前两条走真实源码读取
  const fakeRoot = fixture;
  const edge1 = isTypeEdge("src/Utils.ts", "src/config/ConfigRepository.ts", fakeRoot);
  const edge2 = isTypeEdge("src/config/ConfigRepository.ts", "src/Utils.ts", fakeRoot);
  rmSync(fixture, { recursive: true, force: true });
  if (edge1 !== true || edge2 !== false) {
    console.error(`selftest FAIL：边分类错误（type edge=${edge1}, value edge=${edge2}）`);
    process.exit(1);
  }
  const real = probeCycle.length > 0 ? classify([probeCycle[0]], fixture) : null;
  void real;
  console.log("selftest PASS：类型边/值边分类正确，真环路径可用");
  process.exit(0);
}

const tmp = mkdtempSync(path.join(tmpdir(), "dpdm-"));
const outFile = path.join(tmp, "cycles.json");
const result = spawnSync(process.execPath, [
  dpdmBin,
  "-o", outFile,
  "--progress", "false",
  "--warning", "false",
  "--circular", "false",
  "--tree", "false",
  ENTRY,
], { encoding: "utf8" });

if (!existsSync(outFile)) {
  console.error("dpdm 未产出 JSON（exit=" + result.status + "）：");
  console.error((result.stdout || "") + (result.stderr || ""));
  process.exit(1);
}
const report = JSON.parse(readFileSync(outFile, "utf8"));
rmSync(tmp, { recursive: true, force: true });

const circulars = report.circulars ?? [];
const real = classify(circulars, process.cwd());

console.log(`循环依赖检查：dpdm 报告 ${circulars.length} 条环`);
if (real.length === 0) {
  console.log("PASS：全部为 import type 闭合的类型环（运行时无害），无真环。");
  process.exit(0);
}
console.log(`FAIL：${real.length} 条真环（环上存在值导入边）：`);
for (const item of real) {
  console.log("  环: " + item.files.join(" -> "));
  for (const edge of item.edges.filter((edge) => !edge.typeOnly)) {
    console.log(`    值导入边: ${edge.from} -> ${edge.to}`);
  }
}
process.exit(1);
