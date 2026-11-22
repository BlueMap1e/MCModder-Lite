/**
 * 「表格命令 / 撤销」逻辑测试（真身版）：直接 import 命令类本体跑断言，
 * 不经浏览器、不依赖宿主全局；运行 `npx tsx scripts/logic-tests/table-command.ts`。
 *
 * 被测对象 = src/table/command/ 下五个命令类的语义；
 * 协作者 = `TableContext`，由 `MockTableContext` 按 `GenericTable.vue` 的真实实现
 * 忠实镜像（splice 删除、O(n) 批删、editData 的 edited/content 两段式与宽松等号、
 * insertMultipleRowWithDataMap 的位置重建算法、pasteRow 的索引映射）。
 * 命令正确性依赖上下文正确性——上下文自身的 DOM/响应式行为不在本卷范围。
 *
 * 契约备注（有意不断言）：`DeleteMultipleRowCommand.deletedData` 在构造时即为
 * truthy 的空洞数组，未经 execute 直接 undo 会以空洞数组调用插回——命令类假定
 * 「undo 只在 execute 之后由历史栈逆序调用」（GenericTable.execute 的推栈纪律），
 * 本卷遵循同一纪律，不为违背契约的调用路径立题。
 */
import { Command } from "../../src/table/command/Command";
import { EditCommand } from "../../src/table/command/EditCommand";
import { InsertRowCommand } from "../../src/table/command/InsertRowCommand";
import { DeleteRowCommand } from "../../src/table/command/DeleteRowCommand";
import { DeleteMultipleRowCommand } from "../../src/table/command/DeleteMultipleRowCommand";
import { PasteCommand } from "../../src/table/command/PasteCommand";

type Row = { name: string; rarity: string };

/** 与 GenericTable 相同的默认行生成（本卷的 T 用固定双字段） */
function createDefaultRowData(): Row {
  return { name: "", rarity: "" };
}

/** 按 GenericTable.vue 真实实现镜像的命令上下文（DOM/响应式部分以纯数据替代） */
class MockTableContext {
  currentData: { content: Row; edited?: Partial<Row> }[] = [];
  clipboard: Row[] = [];
  pasteRowCount = 0;

  constructor(rows: Row[]) {
    this.currentData = rows.map((content) => ({ content }));
  }

  getRowData(index: number) {
    return this.currentData[index];
  }
  editData(index: number, key: keyof Row, newValue: unknown) {
    const data = this.currentData[index];
    const original = data.content[key] || "";
    if (original != newValue) {
      (data.edited ??= {})[key] = newValue as Row[keyof Row];
    } else if (data.edited && data.edited[key]) {
      delete data.edited[key];
    }
  }
  insertRow(index: number, newData?: Row) {
    if (!newData) newData = createDefaultRowData();
    if (index < 0 || index > this.currentData.length) return; // 越界忽略，与本体一致
    this.currentData.splice(index, 0, { content: newData });
  }
  insertRowWithDataMap(dataMap: Record<number, Row>) {
    const key = Number(Object.keys(dataMap)[0]);
    this.insertRow(key, dataMap[key]);
  }
  insertMultipleRowWithDataMap(dataMap: Record<number, Row>) {
    let i = 0;
    let j = 0;
    const total = this.currentData.length + Object.keys(dataMap).length;
    const newData: { content: Row; edited?: Partial<Row> }[] = [];
    const deletedRowIndex = this.dataMapToSelection(dataMap);
    for (let k = 0; k < total; k++) {
      if (deletedRowIndex[j] == k) {
        newData.push({ content: dataMap[k] });
        j++;
      } else newData.push(this.currentData[i++]);
    }
    this.currentData = newData;
  }
  deleteRow(index: number): Record<number, Row> {
    const deletedData = this.currentData[index].content;
    this.currentData.splice(index, 1);
    return { [index]: deletedData };
  }
  deleteMultipleRow(selection: number[]): Record<number, Row> {
    const deletedData: Record<number, Row> = {};
    const tempData: ({ content: Row; edited?: Partial<Row> } | null)[] = [...this.currentData];
    selection.forEach((i) => {
      deletedData[i] = this.currentData[i].content;
      tempData[i] = null;
    });
    this.currentData = tempData.filter((row) => row !== null);
    return deletedData;
  }
  pasteRow(index: number): Record<number, Row> {
    this.pasteRowCount++;
    const l = this.currentData.slice(0, index);
    const r = this.currentData.slice(index);
    this.currentData = l.concat(this.clipboard.map((content) => ({ content }))).concat(r);
    const dataMap: Record<number, Row> = {};
    for (let i = 0; i < this.clipboard.length; i++) dataMap[i + index] = this.clipboard[i];
    return dataMap;
  }
  dataMapToSelection(dataMap: Record<number, Row>): number[] {
    return Object.keys(dataMap).map(Number).sort();
  }
}

/** 极简断言器 */
let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}
function contents(ctx: MockTableContext) {
  return ctx.currentData.map((row) => ({ ...row.content, __edited: row.edited ?? null }));
}

// ─── EditCommand：原值捕获 / 撤销回填 / 重做重放 ───
{
  const ctx = new MockTableContext([{ name: "甲", rarity: "R" }]);
  const cmd = new EditCommand<Row, "name">(ctx as never, 0, "name", "乙");
  cmd.execute();
  check("Edit.execute 写入新值到 edited", ctx.currentData[0].edited?.name === "乙");
  check("Edit.execute 不动 saved content", ctx.currentData[0].content.name === "甲");
  check("Edit.execute 捕获原值", cmd.originalValue === "甲");
  cmd.undo();
  check("Edit.undo 还原：edited 标记清除（值等于 content）", !ctx.currentData[0].edited?.name);
  cmd.redo();
  check("Edit.redo 重新应用新值", ctx.currentData[0].edited?.name === "乙");
}

// ─── InsertRowCommand：插默认行 / 撤销移除 ───
{
  const ctx = new MockTableContext([{ name: "甲", rarity: "R" }]);
  const cmd = new InsertRowCommand<Row>(ctx as never, 1);
  cmd.execute();
  check(
    "Insert.execute 在指定位置插入默认行",
    ctx.currentData.length === 2 && ctx.currentData[1].content.name === "",
  );
  cmd.undo();
  check("Insert.undo 行数复原", ctx.currentData.length === 1);
}

// ─── DeleteRowCommand：缓存被删行 / 按原索引插回 / 缓存一次性 ───
{
  const ctx = new MockTableContext([
    { name: "甲", rarity: "R" },
    { name: "乙", rarity: "SR" },
    { name: "丙", rarity: "SSR" },
  ]);
  const cmd = new DeleteRowCommand<Row>(ctx as never, 1);
  cmd.execute();
  check(
    "Delete.execute 删除并缓存",
    ctx.currentData.length === 2 &&
      ctx.currentData.every((r) => r.content.name !== "乙") &&
      cmd.deletedData?.[1]?.name === "乙",
  );
  cmd.undo();
  check(
    "Delete.undo 按原索引插回",
    ctx.currentData.length === 3 && ctx.currentData[1].content.name === "乙",
  );
  check("Delete.undo 清空缓存（重复 undo 为无操作）", cmd.deletedData === undefined);
  const lenBefore = ctx.currentData.length;
  cmd.undo();
  check("Delete 重复 undo 不再变更", ctx.currentData.length === lenBefore);
}

// ─── DeleteMultipleRowCommand：非相邻批量删 / 原位置整体插回 ───
{
  const ctx = new MockTableContext([
    { name: "甲", rarity: "R" },
    { name: "乙", rarity: "SR" },
    { name: "丙", rarity: "SSR" },
    { name: "丁", rarity: "UR" },
  ]);
  const cmd = new DeleteMultipleRowCommand<Row>(ctx as never, [0, 2]);
  cmd.execute();
  check(
    "DeleteMulti.execute 删除所选（保序收缩）",
    ctx.currentData.length === 2 &&
      ctx.currentData[0].content.name === "乙" &&
      ctx.currentData[1].content.name === "丁",
  );
  cmd.undo();
  check(
    "DeleteMulti.undo 按原位置重建（中间空洞由映射填回）",
    contents(ctx)
      .map((r) => r.name)
      .join() === "甲,乙,丙,丁" && ctx.currentData[2].content.rarity === "SSR",
  );
}

// ─── PasteCommand：撤销清除粘贴内容 / 重做不回剪贴板、直接回放缓存 ───
{
  const ctx = new MockTableContext([{ name: "甲", rarity: "R" }]);
  ctx.clipboard = [
    { name: "粘一", rarity: "R" },
    { name: "粘二", rarity: "SR" },
  ];
  const cmd = new PasteCommand<Row>(ctx as never, 1);
  cmd.execute();
  check(
    "Paste.execute 插入剪贴板内容",
    ctx.currentData.length === 3 && ctx.currentData[2].content.name === "粘二",
  );
  cmd.undo();
  check(
    "Paste.undo 移除粘贴的行（原行保留）",
    ctx.currentData.length === 1 && ctx.currentData[0].content.name === "甲",
  );
  const callsBefore = ctx.pasteRowCount;
  cmd.redo();
  check(
    "Paste.redo 不回剪贴板、按缓存原索引回放",
    ctx.pasteRowCount === callsBefore &&
      ctx.currentData.length === 3 &&
      ctx.currentData[1].content.name === "粘一",
  );
}

// ─── 组合场景：三命令 LIFO 撤销回到初始态，重做回放终态 ───
{
  const initial: Row[] = [
    { name: "甲", rarity: "R" },
    { name: "乙", rarity: "SR" },
  ];
  const ctx = new MockTableContext(initial.map((r) => ({ ...r })));
  const history: Command<Row>[] = [];
  const edit = new EditCommand<Row, "name">(ctx as never, 0, "name", "甲改");
  const insert = new InsertRowCommand<Row>(ctx as never, 1);
  const del = new DeleteRowCommand<Row>(ctx as never, 0);
  [edit, insert, del].forEach((cmd) => {
    cmd.execute();
    history.push(cmd);
  });
  const finalState = JSON.stringify(contents(ctx));
  check(
    "组合 execute 后：编辑行被删、默认行占位、末行为乙",
    ctx.currentData.length === 2 &&
      ctx.currentData[0].content.name === "" &&
      ctx.currentData[1].content.name === "乙",
    contents(ctx),
  );
  history.reverse().forEach((cmd) => cmd.undo());
  check(
    "组合 undo 全撤回到初始态",
    JSON.stringify(contents(ctx)) ===
      JSON.stringify(initial.map((r) => ({ ...r, __edited: null }))),
    contents(ctx),
  );
  history.reverse().forEach((cmd) => cmd.redo());
  check("组合 redo 重放终态", JSON.stringify(contents(ctx)) === finalState, contents(ctx));
}

// ─── 汇总 ───
console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
