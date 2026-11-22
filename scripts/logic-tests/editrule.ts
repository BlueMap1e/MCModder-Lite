/**
 * 编辑查错规则逻辑测试（真身版）：直接 import 三个规则类跑断言，
 * 运行 `npx tsx --tsconfig tsconfig.test.json scripts/logic-tests/editrule.ts`
 * （tsconfig.test.json 把虚拟模块 "$" 映射到 GM 桩，供 ClassEditRules 的
 * Values 依赖链加载；规则本体与桩零交互）。
 *
 * 三类被测对象：
 * - `ItemEditRules`：资料编辑（item_add/item_edit）查错。
 * - `TabEditRules`：合成表编辑查错。
 * - `ClassEditRules`：模组编辑查错（44 条规则，本卷逐条覆盖）。
 *
 * 断言口径：各规则的触发/推迟（isAdd 与「编辑时字段 undefined 视为未改动」语义）、
 * 提示级别（error/warning/info）。消息子串取自规则硬编码文案的**独特片段**，
 * 与规则尾注释的原生键名一一对应，改文案会挂卷——这是有意为之（文案与规则绑定）。
 */

type Level = "error" | "warning" | "info";
type Result = Record<Level, string[]>;

function has(result: Result, level: Level, sub: string) {
  return result[level].some((message) => message.includes(sub));
}

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

// ═══════════════ ItemEditRules ═══════════════
import { ItemEditRules } from "../../src/editrule/ItemEditRules";

/** 资料编辑数据的合法基线（物品类资料，字段齐全） */
function itemData(overrides: Record<string, unknown> = {}) {
  return {
    name: "测试物品",
    ename: "Test Item",
    category: "1,1",
    type: "{文本}",
    regname: "test:item",
    maxstack: "64",
    damage: "100",
    oredict: "forge:ores",
    "icon-32x-data": "data:image/png;base64,AAAA",
    "icon-128x-data": "data:image/png;base64,AAAA",
    ...overrides,
  } as never;
}

{
  const r = ItemEditRules.check(itemData(), true);
  check("Item 基线全绿", r.error.length === 0 && r.warning.length === 0 && r.info.length === 0, r);
}

// item_name_empty：新增缺失报错 / 编辑 undefined 推迟 / 编辑空串报错
{
  const add = ItemEditRules.check(itemData({ name: "" }), true);
  check("Item 新增缺主名 → error", has(add, "error", "主要名称"));
  const editUndefined = ItemEditRules.check(itemData({ name: undefined }), false);
  check("Item 编辑 undefined 主名 → 推迟不报", !has(editUndefined, "error", "主要名称"));
  const editEmpty = ItemEditRules.check(itemData({ name: "" }), false);
  check("Item 编辑清空主名 → error", has(editEmpty, "error", "主要名称"));
}

// item_name_repeat：主次同名
{
  const add = ItemEditRules.check(itemData({ ename: "测试物品" }), true);
  check("Item 新增主次同名 → warning", has(add, "warning", "不能相同"));
  const edit = ItemEditRules.check(itemData({ ename: "测试物品" }), false);
  check("Item 编辑主次同名 → warning", has(edit, "warning", "不能相同"));
  const editDefer = ItemEditRules.check(itemData({ ename: undefined }), false);
  check("Item 编辑 ename undefined → 推迟", !has(editDefer, "warning", "不能相同"));
}

// item_category_empty / item_type_empty
{
  const add = ItemEditRules.check(itemData({ category: "" }), true);
  check("Item 新增缺类型 → error", has(add, "error", "资料类型"));
  const editDefer = ItemEditRules.check(itemData({ category: undefined }), false);
  check("Item 编辑 undefined 类型 → 推迟", !has(editDefer, "error", "资料类型"));
  const type = ItemEditRules.check(itemData({ type: "" }), true);
  check("Item 缺资料分类 → warning", has(type, "warning", "资料分类"));
}

// item_c1_icon_empty 族：物品类资料必须带图标（编辑缺省推迟）、占位图标、删除标记、锁定。
// 注意分支条件 = category[0]==="1" 且 type !== "{文本}"（{文本} 为综合主物品豁免）
{
  const itemType = { type: "{材料}" };
  const addNoIcon = ItemEditRules.check(
    itemData({ ...itemType, "icon-32x-data": undefined, "icon-128x-data": undefined }),
    true,
  );
  check("Item 新增物品类缺双图标 → warning", has(addNoIcon, "warning", "小图标"));
  const editNoIcon = ItemEditRules.check(
    itemData({ ...itemType, "icon-32x-data": undefined, "icon-128x-data": undefined }),
    false,
  );
  check("Item 编辑缺图标（未改动）→ 推迟", !has(editNoIcon, "warning", "小图标"));
  const placeholder = ItemEditRules.check(
    itemData({
      ...itemType,
      // 占位图标按裸 URL 检测（endsWith 无查询串）；带 ?v= 查询串的变体会绕过该规则，
      // 与上游 a5a4683 逐字一致（原生编辑器脚本保真），待真机核对编辑器占位图实际形态
      "icon-32x-data": "https://i.mcmod.cn/item/icon/32x32/0.png",
      "icon-128x-data": "https://i.mcmod.cn/item/icon/128x128/0.png",
    }),
    true,
  );
  check("Item 占位图标 → warning", has(placeholder, "warning", "小图标"));
  const deleted = ItemEditRules.check(
    itemData({ ...itemType, "icon-32x-delete": { 0: "1" } as never }),
    true,
  );
  check("Item 图标删除标记 → warning", has(deleted, "warning", "小图标"));
  const pngLock = ItemEditRules.check(
    itemData({ ...itemType, "icon-32x-lock": { 0: "1" } as never }),
    true,
  );
  check("Item 静态图标带锁定 → warning", has(pngLock, "warning", "锁定"));
  const gifLock = ItemEditRules.check(
    itemData({
      ...itemType,
      "icon-32x-data": "data:image/gif;base64,AAAA",
      "icon-128x-data": "data:image/gif;base64,AAAA",
      "icon-32x-lock": { 0: "1" } as never,
    }),
    true,
  );
  check("Item 动态图标带锁定 → 不提示", !has(gifLock, "warning", "锁定"));
  const exempt = ItemEditRules.check(
    itemData({ "icon-32x-data": undefined, "icon-128x-data": undefined }),
    true,
  );
  check("Item 综合主物品（{文本}）豁免图标检查", !has(exempt, "warning", "小图标"));
}

// regname / maxstack / damage / oredict：物品类分支的四级提示
{
  const add = ItemEditRules.check(
    itemData({ type: "{材料}", regname: "", maxstack: "", damage: "", oredict: "" }),
    true,
  );
  check("Item 新增缺注册名 → warning", has(add, "warning", "注册名"));
  check("Item 新增缺最大堆叠 → warning", has(add, "warning", "堆叠"));
  check("Item 新增缺耐久 → info", has(add, "info", "耐久"));
  check("Item 新增缺矿词 → info", has(add, "info", "矿物词典"));
  const editDefer = ItemEditRules.check(itemData({ type: "{材料}", regname: undefined }), false);
  check("Item 编辑 undefined 注册名 → 推迟", !has(editDefer, "warning", "注册名"));
  const nonItem = ItemEditRules.check(
    itemData({ type: "{材料}", category: "0,8", regname: "" }),
    true,
  );
  check("Item 非物品类资料不触发注册名检查", !has(nonItem, "warning", "注册名"));
}

// ═══════════════ TabEditRules ═══════════════
import { TabEditRules } from "../../src/editrule/TabEditRules";

/** 合成表编辑数据的基线（输入输出各一格，非空） */
function tabData(overrides: Record<string, unknown> = {}) {
  return {
    "slot-in-item": { "0": "minecraft:stone" },
    "slot-out-item": { "0": "minecraft:cobblestone" },
    ...overrides,
  } as never;
}

{
  const r = TabEditRules.check(tabData(), true);
  check("Tab 基线全绿", r.error.length === 0 && r.warning.length === 0 && r.info.length === 0, r);
  const addEmpty = TabEditRules.check(tabData({ "slot-in-item": {}, "slot-out-item": {} }), true);
  check("Tab 新增空输入 → warning", has(addEmpty, "warning", "输入材料"));
  check("Tab 新增空输出 → warning", has(addEmpty, "warning", "输出材料"));
  const whitespace = TabEditRules.check(tabData({ "slot-in-item": { "0": "   " } }), true);
  check("Tab 纯空白输入视为空 → warning", has(whitespace, "warning", "输入材料"));
  const editDefer = TabEditRules.check(tabData({ "slot-in-item": undefined }), false);
  check("Tab 编辑 undefined 输入 → 推迟", !has(editDefer, "warning", "输入材料"));
}

// ═══════════════ ClassEditRules ═══════════════
import { ClassEditRules } from "../../src/editrule/ClassEditRules";

/** 模组编辑数据的合法基线（核心元素/封面/平台/作者/链接/正文全齐） */
function classData(overrides: Record<string, unknown> = {}) {
  return {
    name: "测试模组",
    ename: "Test Mod",
    sname: "TM",
    category: { 0: "1,1" },
    "cover-data": "https://i.mcmod.cn/cover/test.png",
    platform: { 0: "client" },
    api: { 1: "1" },
    mcversion: { 1: { "1.20.1": "1.20.1" } },
    modid: "testmod",
    author: { add: { 0: { name: "作者" } }, link: {} },
    relation: { 0: { title: "前置" } },
    link: {
      0: {
        title: "curseforge",
        href: "https://www.curseforge.com/minecraft/mc-mods/testmod",
        text: "",
        custom: "",
      },
    },
    cfprojectid: "123456",
    content: "<p>这是一个测试模组的介绍。</p>",
    source: { 0: "0" },
    ...overrides,
  } as never;
}

{
  const add = ClassEditRules.check(classData(), true);
  check(
    "Class 基线全绿（新增）",
    add.error.length === 0 && add.warning.length === 0 && add.info.length === 0,
    add,
  );
  const edit = ClassEditRules.check(classData(), false);
  check(
    "Class 基线全绿（编辑）",
    edit.error.length === 0 && edit.warning.length === 0 && edit.info.length === 0,
    edit,
  );
}

// checkName
{
  const r = ClassEditRules.check(classData({ name: "", ename: "" }), true);
  check("Class 新增缺主名 → error", has(r, "error", "主要名称"));
  const repeat = ClassEditRules.check(classData({ ename: "测试模组" }), true);
  check("Class 主次同名 → warning", has(repeat, "warning", "不能相同"));
  const chinese = ClassEditRules.check(classData({ ename: "英文模组中文" }), true);
  check("Class 次要名称含中文 → warning", has(chinese, "warning", "次要名称不能为中文"));
  const sname = ClassEditRules.check(classData({ sname: "超长简写名称测试" }), true);
  check("Class 简写超 5 字 → warning", has(sname, "warning", "简写名称"));
  const defer = ClassEditRules.check(classData({ name: undefined }), false);
  check("Class 编辑 undefined 主名 → 推迟", !has(defer, "error", "主要名称"));
}

// checkCategory：核心元素有且仅有一种
{
  const addNone = ClassEditRules.check(classData({ category: undefined }), true);
  check("Class 新增无核心元素 → error", has(addNone, "error", "核心元素"));
  const addNonCore = ClassEditRules.check(classData({ category: { 0: "0,8" } }), true);
  check("Class 新增仅非核心元素 → error", has(addNonCore, "error", "核心元素"));
  const editDefer = ClassEditRules.check(classData({ category: undefined }), false);
  check("Class 编辑 undefined category → 推迟", !has(editDefer, "error", "核心元素"));
  const editNonCore = ClassEditRules.check(classData({ category: { 0: "0,8" } }), false);
  check("Class 编辑改掉核心元素 → error", has(editNonCore, "error", "核心元素"));
}

// checkCover
{
  const addNone = ClassEditRules.check(classData({ "cover-data": "" }), true);
  check("Class 新增无封面 → warning", has(addNone, "warning", "封面"));
  const addDeleted = ClassEditRules.check(classData({ "cover-delete": { 0: "1" } as never }), true);
  check("Class 新增即删封面 → warning", has(addDeleted, "warning", "封面"));
  const editDeleted = ClassEditRules.check(
    classData({ "cover-delete": { 0: "1" } as never }),
    false,
  );
  check("Class 编辑删封面 → warning", has(editDeleted, "warning", "封面"));
  const editDefer = ClassEditRules.check(classData({ "cover-data": undefined }), false);
  check("Class 编辑 undefined 封面 → 推迟", !has(editDefer, "warning", "封面"));
}

// checkPlatform：平台/运作方式缺失 + 漏勾版本
{
  const addEmpty = ClassEditRules.check(classData({ platform: {}, api: {} }), true);
  check("Class 新增缺平台或运作方式 → error", has(addEmpty, "error", "支持平台"));
  const mcverEmpty = ClassEditRules.check(
    classData({ api: { 2: "2" }, mcversion: { 1: { "1.20.1": "1.20.1" } } }),
    true,
  );
  check("Class Fabric 未勾版本 → error 且点名", has(mcverEmpty, "error", "Fabric"));
  const editDefer = ClassEditRules.check(classData({ mcversion: undefined }), false);
  check("Class 编辑 undefined mcversion → 推迟", !has(editDefer, "error", "还未勾选版本"));
}

// checkModid：缺失 / 豁免平台 / 异常符号 / 生成器缺省值
{
  const addMissing = ClassEditRules.check(classData({ modid: "" }), true);
  check("Class 新增缺 MODID → warning", has(addMissing, "warning", "MODID"));
  const exempt = ClassEditRules.check(classData({ modid: "", api: { 0: "5" } }), true);
  check("Class 数据包平台豁免 MODID → 干净", !has(exempt, "warning", "MODID"));
  const spliter = ClassEditRules.check(classData({ modid: "a，b" }), true);
  check("Class MODID 含中文逗号 → warning", has(spliter, "warning", "异常符号"));
  const minecraft = ClassEditRules.check(classData({ modid: "minecraft" }), true);
  check("Class MODID 占用 minecraft → warning", has(minecraft, "warning", "生成器"));
  const example = ClassEditRules.check(classData({ modid: "example-mod" }), true);
  check("Class MODID 生成器缺省 → warning", has(example, "warning", "生成器"));
}

// checkSpliter：标签与关键词的中文逗号
{
  const tag = ClassEditRules.check(classData({ tag: "科技，魔法" }), true);
  check("Class 标签含中文逗号 → warning", has(tag, "warning", "标签"));
  const keys = ClassEditRules.check(classData({ keys: "科技，魔法" }), true);
  check("Class 关键词含中文逗号 → warning", has(keys, "warning", "关键词"));
}

// checkAuthor
{
  const addEmpty = ClassEditRules.check(classData({ author: { add: {}, link: {} } }), true);
  check("Class 新增缺作者 → error", has(addEmpty, "error", "作者"));
  const editDefer = ClassEditRules.check(classData({ author: undefined }), false);
  check("Class 编辑 undefined 作者 → 推迟", !has(editDefer, "error", "作者"));
}

// checkRelation：条件组同名
{
  const dup = ClassEditRules.check(
    classData({ relation: { 0: { title: "前置" }, 1: { title: "前置" } } }),
    true,
  );
  check("Class 条件组同名 → error", has(dup, "error", "同名条件"));
}

// checkProjectID：CF/MR 链接必须带 ID（仅新增阶段）
{
  const cfMissing = ClassEditRules.check(classData({ cfprojectid: undefined }), true);
  check("Class CF 链接缺 CFID → warning", has(cfMissing, "warning", "CFID"));
  const cfFormat = ClassEditRules.check(classData({ cfprojectid: "12a" }), true);
  check("Class CFID 非数字 → warning", has(cfFormat, "warning", "数字"));
  const mrMissing = ClassEditRules.check(
    classData({
      link: {
        0: { title: "modrinth", href: "https://modrinth.com/mod/test", text: "", custom: "" },
      },
      mrprojectid: undefined,
    }),
    true,
  );
  check("Class MR 链接缺 MRID → warning", has(mrMissing, "warning", "MRID"));
  const mrFormat = ClassEditRules.check(
    classData({
      link: {
        0: { title: "modrinth", href: "https://modrinth.com/mod/test", text: "", custom: "" },
      },
      mrprojectid: "abc",
    }),
    true,
  );
  check("Class MRID 非 8 位 → warning", has(mrFormat, "warning", "8 位"));
  const editDefer = ClassEditRules.check(classData({ cfprojectid: undefined }), false);
  check("Class 编辑阶段不查项目 ID → 推迟", !has(editDefer, "warning", "CFID"));
}

// checkLink：13 条子规则
{
  const allBlank = ClassEditRules.check(
    classData({ link: { 0: { title: "official", href: " ", text: "", custom: "" } } }),
    true,
  );
  check("Class 链接全空 → warning 考证来源", has(allBlank, "warning", "考证"));
  const nohttp = ClassEditRules.check(
    classData({
      link: { 0: { title: "other", href: "www.example.com", text: "", custom: "示例" } },
    }),
    true,
  );
  check("Class 链接无协议头 → error", has(nohttp, "error", "https"));
  const noStatement = ClassEditRules.check(
    classData({
      link: { 0: { title: "baidupan", href: "https://pan.baidu.com/s/1", text: "", custom: "" } },
    }),
    true,
  );
  check("Class 网盘缺作者声明 → warning", has(noStatement, "warning", "作者声明"));
  const wrongLocation = ClassEditRules.check(
    classData({
      link: {
        0: { title: "other", href: "https://example.com 提取码：1234", text: "", custom: "示例" },
      },
    }),
    true,
  );
  check("Class 地址混入提取码 → warning", has(wrongLocation, "warning", "非链接内容"));
  const remarkRedund = ClassEditRules.check(
    classData({
      link: {
        0: { title: "github", href: "https://github.com/a/b", text: "(GitHub)", custom: "" },
      },
    }),
    true,
  );
  check("Class 备注与前缀冗余 → warning", has(remarkRedund, "warning", "不必在备注中填写"));
  const cfSuffix = ClassEditRules.check(
    classData({
      link: {
        0: {
          title: "curseforge",
          href: "https://www.curseforge.com/minecraft/mc-mods/testmod/files",
          text: "",
          custom: "",
        },
      },
    }),
    true,
  );
  check("Class CF 冗余后缀 → warning", has(cfSuffix, "warning", "/files"));
  const mrSuffix = ClassEditRules.check(
    classData({
      link: {
        0: {
          title: "modrinth",
          href: "https://modrinth.com/mod/test/gallery",
          text: "",
          custom: "",
        },
      },
      mrprojectid: "abcdefgh",
    }),
    true,
  );
  check("Class MR 冗余后缀 → warning", has(mrSuffix, "warning", "/gallery"));
  const commonParam = ClassEditRules.check(
    classData({
      link: {
        0: { title: "other", href: "https://example.com/?spm_id_from=1", text: "", custom: "示例" },
      },
    }),
    true,
  );
  check("Class 冗余跳转参数 → warning", has(commonParam, "warning", "spm_id_from"));
  const noPrefix = ClassEditRules.check(
    classData({
      link: {
        0: {
          title: "official",
          href: "https://www.curseforge.com/minecraft/mc-mods/testmod",
          text: "",
          custom: "",
        },
      },
      cfprojectid: "123456",
    }),
    true,
  );
  check("Class CF 用官方前缀 → info 提示", has(noPrefix, "info", "预设前缀"));
  const personal = ClassEditRules.check(
    classData({
      link: {
        0: { title: "other", href: "https://space.bilibili.com/123", text: "", custom: "B站" },
      },
    }),
    true,
  );
  check("Class 个人空间地址 → warning", has(personal, "warning", "个人地址"));
  const nested = ClassEditRules.check(
    classData({
      link: {
        0: {
          title: "other",
          href: "https://modrinth.com/project/test",
          text: "",
          custom: "Modrinth",
        },
      },
    }),
    true,
  );
  check("Class 套娃链接 → warning", has(nested, "warning", "套娃链接"));
  const sourceMissing = ClassEditRules.check(classData({ source: { 0: "1" } }), true);
  check("Class 声明开源但无源码地址 → warning", has(sourceMissing, "warning", "开源协议"));
  const sourceOk = ClassEditRules.check(
    classData({
      source: { 0: "1" },
      link: {
        0: {
          title: "curseforge",
          href: "https://www.curseforge.com/minecraft/mc-mods/testmod",
          text: "",
          custom: "",
        },
        1: { title: "github", href: "https://github.com/a/testmod", text: "", custom: "" },
      },
    }),
    true,
  );
  check("Class 开源含源码地址 → 不提示", !has(sourceOk, "warning", "开源协议"));
  const editDefer = ClassEditRules.check(classData({ link: undefined }), false);
  check("Class 编辑 undefined 链接 → 推迟", !has(editDefer, "warning", "考证"));
}

// checkContent：正文 10 条子规则
{
  const empty = ClassEditRules.check(classData({ content: "<p></p>" }), true);
  check("Class 空正文 → error", has(empty, "error", "文字介绍"));
  const ending = ClassEditRules.check(classData({ content: "这是一个介绍" }), true);
  check("Class 无句号结尾 → warning", has(ending, "warning", "标点符号"));
  const broken = ClassEditRules.check(
    classData({ content: "[h1=标题]正文[h3=小标题]内容。" }),
    true,
  );
  check("Class 跨级标题 → warning", has(broken, "warning", "跨级"));
  const less = ClassEditRules.check(classData({ content: "[h1=标题]内容。" }), true);
  check("Class 少标题无禁用标记 → warning", has(less, "warning", "标题目录禁用标记"));
  const pronoun = ClassEditRules.check(classData({ content: "这个模组适合你和您的朋友。" }), true);
  check("Class 你/您混用 → warning", has(pronoun, "warning", "第二人称"));
  const spaces = ClassEditRules.check(classData({ content: "这是     一个介绍。" }), true);
  check("Class 大量空格排版 → warning", has(spaces, "warning", "空格"));
  const hr = ClassEditRules.check(classData({ content: "内容如下-----。" }), true);
  check("Class 横线分隔线 → warning", has(hr, "warning", "水平分割线"));
  const noChinese = ClassEditRules.check(
    classData({ content: "<p>This is a test mod.</p>" }),
    true,
  );
  check("Class 无中文 → warning", has(noChinese, "warning", "汉语"));
  const banDup = ClassEditRules.check(
    classData({ content: "介绍。[ban:title_menu]内容[ban:title_menu]" }),
    true,
  );
  check("Class 重复禁用标记 → warning", has(banDup, "warning", "重复的 [ban:title_menu]"));
  const bug = ClassEditRules.check(classData({ content: "<p>修复了若干 bug。</p>" }), true);
  check("Class 提及 bug → info", has(bug, "info", "特性反馈"));
}

// checkLicense
{
  const dup = ClassEditRules.check(
    classData({
      license: {
        0: {
          title: "通用",
          list: { 0: { type: "source", name: "MIT", link: "https://mit", text: "" } },
        },
        1: {
          title: "通用",
          list: { 0: { type: "source", name: "MIT", link: "https://mit", text: "" } },
        },
      },
    }),
    true,
  );
  check("Class 许可条件组同名 → error", has(dup, "error", "同名条件"));
  const emptyEntry = ClassEditRules.check(
    classData({
      license: {
        0: { title: "通用", list: { 0: { type: "source", name: "MIT", link: "", text: "" } } },
      },
    }),
    true,
  );
  check("Class 许可条目无地址 → error", has(emptyEntry, "error", "许可声明"));
}

// ─── 汇总 ───
console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
