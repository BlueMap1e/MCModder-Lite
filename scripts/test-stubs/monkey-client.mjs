/**
 * 逻辑测试专用的 GM API 桩：替代 vite-plugin-monkey 的虚拟 "$" 模块，
 * 使 src 下引用 "$" 的纯逻辑模块（如 Values.ts）能在 tsx / plain Node 下加载。
 *
 * 仅保证「可加载」：所有 API 均为空操作或抛错，逻辑测试**不得**实际调用它们——
 * 需要真实 GM 行为的测试请沿用 src/background/__logic-test.cjs 的内存 Map 假存储形态。
 */

function notAvailable(name) {
  return () => {
    throw new Error(`GM API ${name} 在逻辑测试环境中不可用（test-stubs/monkey-client.mjs）`);
  };
}

export const GM_info = { script: { name: "mcmodder-lite-logic-test", version: "0" } };
export const GM_getValue = notAvailable("GM_getValue");
export const GM_setValue = notAvailable("GM_setValue");
export const GM_deleteValue = notAvailable("GM_deleteValue");
export const GM_listValues = notAvailable("GM_listValues");
export const GM_openInTab = notAvailable("GM_openInTab");
export const GM_xmlhttpRequest = notAvailable("GM_xmlhttpRequest");
export const GM_cookie = notAvailable("GM_cookie");
export const GM_addValueChangeListener = notAvailable("GM_addValueChangeListener");
export const GM_removeValueChangeListener = notAvailable("GM_removeValueChangeListener");
export const GM_registerMenuCommand = notAvailable("GM_registerMenuCommand");
export const GM_unregisterMenuCommand = notAvailable("GM_unregisterMenuCommand");
export const GM_download = notAvailable("GM_download");
