/**
 * 合成表数量键盘增强纯决策测试：TabAssistInit.stepQty（↑/↓ ±1、Shift ×2/÷2、
 * placeholder 默认值回落、非数值/非步进键位不接管）。运行
 * `npx tsx --tsconfig tsconfig.test.json scripts/logic-tests/tab-qty-keynav.ts`。
 */
import assert from "node:assert/strict";
import { TabAssistInit } from "../../src/init/TabAssistInit";

const step = (v: string, ph: string, kc: number, sh: boolean) =>
  TabAssistInit.stepQty(v, ph, kc, sh);

const PH = "1号材料需求数量。(默认: 1)";

// 空值回落 placeholder 默认值
assert.equal(step("", PH, 38, false), 2, "空值 ↑ = 默认+1");
assert.equal(step("", PH, 40, false), 0, "空值 ↓ = 默认-1");
// 常规 ±1
assert.equal(step("3", PH, 38, false), 4, "3 ↑ = 4");
assert.equal(step("3", PH, 40, false), 2, "3 ↓ = 2");
// Shift ×2/÷2（双侧 floor，上游语义）
assert.equal(step("3", PH, 38, true), 6, "3 Shift+↑ = ×2");
assert.equal(step("3", PH, 40, true), 1, "3 Shift+↓ = floor(1.5)=1");
assert.equal(step("5", PH, 40, true), 2, "5 Shift+↓ = floor(2.5)=2");
// 不消耗的 -1
assert.equal(step("-1", PH, 38, true), -2, "-1 ×2 = -2");
assert.equal(step("-1", PH, 40, true), -1, "-1 ÷2 = floor(-0.5)=-1");
// 非数值 / 无默认数回落失败 / 非步进键位：不接管
assert.equal(step("c:dirt", PH, 38, false), null, "矿词条 ↑ 不接管");
assert.equal(step("", "x。(默认: )", 38, false), null, "无默认数回落失败 → 不接管");
assert.equal(step("", PH, 13, false), null, "Enter 不属于步进");
assert.equal(step("", PH, 83, true), null, "无关键位 → null");

console.log("PASS tab-qty-keynav（13 断言）");
