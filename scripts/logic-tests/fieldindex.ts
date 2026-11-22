/**
 * FieldIndex 逻辑测试（真身版）：直接 import 索引类本体跑断言，
 * 运行 `npx tsx scripts/logic-tests/fieldindex.ts`。全纯 Map 实现，无需任何桩。
 */
import { FieldIndex } from "../../src/fieldindex/FieldIndex";

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

type Item = { id: number; name: string; tags: string[] };

// ─── 单键直索引：按插入序返回，未命中 undefined ───
{
  const index = new FieldIndex<Item, "name">("name");
  const a: Item = { id: 1, name: "甲", tags: [] };
  const b: Item = { id: 2, name: "乙", tags: [] };
  index.add([a, b]);
  check("get 命中返回该键下全部对象", index.get("甲")?.length === 1 && index.get("甲")?.[0] === a);
  check("未命中返回 undefined", index.get("不存在") === undefined);
  const c: Item = { id: 3, name: "甲", tags: [] };
  index.add([c]);
  check(
    "同键重复对象按插入序追加（不去重）",
    index.get("甲")?.length === 2 && index.get("甲")?.[1] === c,
  );
}

// ─── keyHandler 单值变换：小写归一 ───
{
  const index = new FieldIndex<Item, "name", string>("name", (name) => name.toLowerCase());
  index.add([{ id: 1, name: "Stone", tags: [] }]);
  check(
    "handler 变换后可命中原始大小写变体",
    index.get("stone")?.length === 1 && index.get("STONE") === undefined,
  );
}

// ─── keyHandler 多键分流：一个对象挂多个键 ───
{
  const index = new FieldIndex<Item, "tags", string>("tags", (tags) => tags);
  const item: Item = { id: 1, name: "甲", tags: ["矿物", "装饰"] };
  index.add([item]);
  check(
    "对象挂到数组的每个键下",
    index.get("矿物")?.[0] === item && index.get("装饰")?.[0] === item,
  );
  check(
    "多键对象在各键列表各存一份（同一引用）",
    index.get("矿物")?.[0] === index.get("装饰")?.[0],
  );
}

// ─── getKeyOrDefault：命中取首条字段，未命中回退 ───
{
  const index = new FieldIndex<Item, "name">("name");
  index.add([
    { id: 1, name: "甲", tags: [] },
    { id: 2, name: "甲", tags: [] },
  ]);
  check("命中取首条对象的字段", index.getKeyOrDefault("甲", "id", -1) === 1);
  check("未命中返回默认值", index.getKeyOrDefault("无", "id", -1) === -1);
}

// ─── clear：全清后回未命中态 ───
{
  const index = new FieldIndex<Item, "name">("name");
  index.add([{ id: 1, name: "甲", tags: [] }]);
  index.clear();
  check("clear 后未命中", index.get("甲") === undefined);
}

// ─── 汇总 ───
console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
