/**
 * 发版前一键检查（给人看的版本）。
 *
 * 依次跑：代码规范 → 构建 → 公共页面测试 → 安全测试。
 * 全程只读真实页面，不会改站点数据；任何一步失败就停，并在最后给结论。
 *
 * 用法：npm run check
 */
import { spawnSync } from "node:child_process";

const steps = [
  { title: "第 1/4 步：检查代码规范", command: "npm run --silent verify" },
  { title: "第 2/4 步：把源码打包成脚本", command: "npm run --silent build" },
  { title: "第 3/4 步：自动打开百科页面测试", command: "node scripts/smoke-public.mjs" },
  { title: "第 4/4 步：自动模拟坏输入测试", command: "node scripts/security-smoke.mjs" },
];

console.log("开始检查。整个过程约 2 分钟，不需要你操作浏览器。\n");

let failedAt = "";
for (const step of steps) {
  console.log(`\n=== ${step.title} ===`);
  const result = spawnSync(step.command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    failedAt = step.title;
    break;
  }
}

if (failedAt) {
  console.log(`\n${"=".repeat(48)}`);
  console.log(`结果：没有通过（卡在「${failedAt}」）。`);
  console.log("先不要发版。把上面最后 20 行发给我即可。");
  console.log("=".repeat(48));
  process.exitCode = 1;
} else {
  console.log(`\n${"=".repeat(48)}`);
  console.log("结果：全部通过，可以发版。");
  console.log("接着按 docs/release-checklist.md 的「第 2 件」点三处看看即可。");
  console.log("=".repeat(48));
  process.exitCode = 0;
}
