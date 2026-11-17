const fs = require("fs");
const { spawnSync } = require("child_process");

const version = process.env.VERSION;
const isNewVersion = process.env.IS_NEW_VERSION;
const tagName = process.env.TAG_NAME;
const targetSha = process.env.TARGET_SHA;

const changelog = fs.existsSync("CHANGELOG.md") ? fs.readFileSync("CHANGELOG.md", "utf8") : "";

// tag 已存在（IS_NEW_VERSION=false）：该提交的 [release] 字样晚于真正的发版
// 提交到达（如修 bug 的提交信息里提到「[release]」字样），发版已完成，无事可做——
// 直接成功退出，不进版本一致性/notes 校验（那些校验针对的是「即将创建」的形态，
// 对已完成的历史提交会误报红灯，2026-11-17 实例）。
if (isNewVersion !== "true") {
  console.log(`Tag ${tagName} 已存在，本次推送无需重复发版，跳过。`);
  process.exit(0);
}

// 版本一致性前置：CHANGELOG 的首个小节必须就是本次版本。
// 否则说明清单没 bump / 小节写错，会打出重复 tag（vX_N）且 release notes 为空。
const firstHeading = changelog.match(/^##\s*\[([^\]]+)\]/m)?.[1];
if (!firstHeading || firstHeading !== version) {
  console.error(
    `拒绝发版：CHANGELOG 首个小节是 ${firstHeading ?? "(缺失)"}，与 package.json 的 ${version} 不一致。` +
      `\n请先 bump package.json / vite.config.ts，并把 CHANGELOG 的 "${version}" 小节放到最前面。`,
  );
  process.exit(1);
}

// 从 CHANGELOG 提取本次版本小节作为 release notes。e256433 重构校验顺序时把这段
// 孤儿化了（notes 未声明，首发尝试必 ReferenceError，2026-11-18 v2.4.2-lite.1
// 首个真实首发暴露）——按版本前缀匹配小节标题，日期后缀不参与匹配。
let notes = "";
if (isNewVersion === "true" && changelog) {
  const escapedVersion = version.replace(/\./g, "\\.");
  const regex = new RegExp("##\\s*\\[" + escapedVersion + "\\][^\\n]*([\\s\\S]*?)(?=\\n##\\s*\\[|$)");
  const match = changelog.match(regex);
  if (match && match[1]) {
    notes = match[1].trim();
  }
}

if (!notes) {
  console.error("拒绝发版：release notes 为空（版本小节解析不到内容）。");
  process.exit(1);
}

const args = ["release", "create", tagName, "dist/mcmodder-lite.user.js", "--title", "v" + version, "--notes", notes];
// tag 必须落在本次构建的那个 commit 上；缺省时 gh 会打到默认分支 HEAD，
// 从并非 main 的分支发版就会让 tag 指向错误的代码。
if (targetSha) args.push("--target", targetSha);
const result = spawnSync("gh", args, { stdio: "inherit" });
if (result.status !== 0) {
  process.exit(result.status || 1);
}
