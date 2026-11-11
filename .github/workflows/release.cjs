const fs = require("fs");
const { spawnSync } = require("child_process");

const version = process.env.VERSION;
const isNewVersion = process.env.IS_NEW_VERSION;
const tagName = process.env.TAG_NAME;
const targetSha = process.env.TARGET_SHA;

const changelog = fs.existsSync("CHANGELOG.md") ? fs.readFileSync("CHANGELOG.md", "utf8") : "";

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
