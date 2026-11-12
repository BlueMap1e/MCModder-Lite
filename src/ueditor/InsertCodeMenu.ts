import type { Mcmodder } from "../Mcmodder";
import { Utils } from "../Utils";

/**
 * 「插入代码」下拉菜单扩展（YAML / TOML / TypeScript）。
 *
 * # 站点机制（ueditor.all.js + 真机探针实证）
 * - 菜单由 `b.insertcode` 工厂在编辑器初始化时一次性构建：`options.insertcode`
 *   是 `{刷名: 标签HTML}` 对象（25 项），条目部件注册在 `$EDITORUI` 里；
 *   事后改 `options.insertcode` 不会重建菜单。
 * - 粗体标签 = 站点「有刷子」的惯例（cb / java / python 三项粗体）。本扩展
 *   追加的三项走**非粗体**纯文本（用户明示偏好，不冒充站点自带项）。
 * - Combox 点击链：条目 `onclick → combox.selectByIndex(index) → onselect →
 *   editor.execCommand("insertcode", 刷名)`，其中 onselect 不收弹层；弹层
 *   `display:none` 与按钮 `edui-state-opened` 的复位才构成完整收尾——直调
 *   `execCommand` 而不复位正是上一轮「工具栏置灰」回归的根因（残留弹层遮挡）。
 * - 弹层 DOM 在 hide/show 之间持久：克隆条目追加一次即常驻，无需重复注入。
 *
 * # 实现通道
 * 与 CodeBrushInit 同理，全部在**页面上文**执行（静态脚本经
 * {@link Utils.addScript} 注入）：克隆原生条目、内联 onclick 在真机已实证
 * 可执行（上一轮迭代 1），页面上文内重写处理器与标签零跨沙箱共享问题。
 * 追加时机 = 首次 showPopup（包装实例方法）：弹层 DOM 渲染完成后再克隆，
 * 平时不打开菜单则零 DOM 开销。
 */
export function extendInsertCodeMenu(parent: Mcmodder) {
  if (parent.configRepository.getSettings("codeBrushLanguages") === false) return;
  // 仅内容编辑页有带 insertcode 的完整工具栏；center 留言板等精简编辑器没有，
  // 不给那些页面留下「轮询超时」的噪音路径
  if (!(parent.href.startsWith(parent.hostname) && parent.href.includes("/edit/"))) return;
  const loc = document.head ?? document.documentElement;
  if (!loc) {
    console.warn("[MCModder-Lite] 插入代码菜单扩展跳过：找不到注入宿主。");
    return;
  }
  console.log("[MCModder-Lite] 插入代码菜单扩展注入（页面上文）");
  Utils.addScript(loc, MENU_SCRIPT);
}

/** 页面上文执行的菜单扩展脚本（String.raw 承载：内容零反引号零 `${`） */
const MENU_SCRIPT = String.raw`
(function () {
  if (window.__mcmodderInsertCodeMenu) return;
  window.__mcmodderInsertCodeMenu = true;
  var TAG = "[MCModder-Lite][InsertCodeMenu]";
  var LANGS = [
    { value: "yaml", label: "YAML" },
    { value: "toml", label: "TOML" },
    { value: "ts", label: "TypeScript" }
  ];
  function findInst() {
    var btn = document.querySelector(".edui-editor-toolbarboxinner .edui-for-insertcode");
    if (!btn) return null;
    var state = btn.querySelector("[onmousedown]") || btn;
    var m = /\$EDITORUI\["([^"]+)"\]/.exec(state.getAttribute("onmousedown") || "");
    return m ? window.$EDITORUI[m[1]] : null;
  }
  window.__mcmodderInsertCodePick = function (value) {
    var inst = findInst();
    try {
      if (inst && inst.editor && typeof inst.editor.execCommand === "function") {
        inst.editor.execCommand("insertcode", value);
      }
    } catch (e) {
      console.warn(TAG, "插入失败：", e);
    }
    try {
      if (inst && inst.popup && typeof inst.popup.hide === "function") inst.popup.hide();
    } catch (e) {}
    var btn = document.querySelector(".edui-editor-toolbarboxinner .edui-for-insertcode");
    var state = btn && (btn.querySelector("[onmousedown]") || btn);
    if (state && state.classList) state.classList.remove("edui-state-opened");
  };
  function appendItems(inst) {
    var content = document.querySelector(".edui-for-insertcode.edui-popup .edui-popup-content");
    if (!content) return;
    var items = content.querySelectorAll(".edui-listitem");
    if (!items.length) return;
    var tpl = items[items.length - 1];
    var opts = (inst.editor && inst.editor.options && inst.editor.options.insertcode) || {};
    var added = 0;
    LANGS.forEach(function (lang) {
      if (Object.prototype.hasOwnProperty.call(opts, lang.value)) return;
      var node = tpl.cloneNode(true);
      node.removeAttribute("id");
      node.setAttribute("onmouseover", "this.classList.add('edui-state-hover')");
      node.setAttribute("onmouseout", "this.classList.remove('edui-state-hover')");
      node.setAttribute("onmousedown", "this.classList.add('edui-state-active')");
      node.setAttribute("onmouseup", "this.classList.remove('edui-state-active')");
      node.setAttribute("onclick", "window.__mcmodderInsertCodePick('" + lang.value + "')");
      node.classList.add("mcmodder-insertcode-item");
      var label = node.querySelector(".edui-listitem-label");
      if (label) label.textContent = lang.label;
      content.appendChild(node);
      added++;
    });
    if (added) console.log(TAG, "菜单扩展完成：追加 " + added + " 项");
  }
  function hook(inst) {
    if (!inst) return false;
    if (inst.__mcmodderMenuExt) return true;
    if (typeof inst.showPopup !== "function") return true;
    inst.__mcmodderMenuExt = true;
    var orig = inst.showPopup;
    inst.showPopup = function () {
      var r = orig.apply(this, arguments);
      if (!this.__mcmodderAppended) {
        this.__mcmodderAppended = true;
        try {
          appendItems(this);
        } catch (e) {
          console.warn(TAG, "条目追加失败：", e);
        }
      }
      return r;
    };
    console.log(TAG, "已挂接 showPopup，首次打开菜单时追加条目");
    return true;
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (hook(findInst())) {
      clearInterval(timer);
      return;
    }
    if (tries >= 40) {
      clearInterval(timer);
      console.warn(TAG, "超时：未找到 insertcode 工具栏部件");
    }
  }, 300);
})();
`;
