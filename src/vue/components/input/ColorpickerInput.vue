<template>
  <div class="mcmodder-colorpicker">
    <!-- 预设色块：全部经过亮/夜两底对比度筛查，按用途分组 -->
    <div class="mcmodder-colorpicker-swatches">
      <button
        v-for="preset in PRESETS"
        :key="preset.color"
        type="button"
        class="mcmodder-colorpicker-swatch"
        :class="{ 'is-active': preset.color === activeColor }"
        :style="{ background: preset.color }"
        :title="`${preset.group} ${preset.color}`"
        :aria-label="`${preset.group} ${preset.color}`"
        @click="pick(preset.color)"
      />
      <!-- 原生取色器兜底：完全自定义时使用 -->
      <input
        ref="inputRef"
        type="color"
        class="mcmodder-colorpicker-native"
        :title="title + '（自定义）'"
        :aria-label="title"
        @change="handleNativeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useInputBase } from "../../composables/useInputBase";
import type { InputProps } from "../../../types/props";

const props = defineProps<InputProps<string>>();

const inputRef = useTemplateRef("inputRef");

const { onChange, getValue, setCurrentValue, setDisplayValue } = useInputBase({
  inputRef,
  value: props.value,
  getDOMValue,
  setDOMValue,
  onSuccessfulChange: props.onSuccessfulChange,
});

/** 当前生效的颜色（用于高亮预设色块；跟随任何来源的变更） */
const activeColor = ref(props.value);

/**
 * 预设色板。选色原则：中性、低冲击、亮/夜两底皆可用。
 * - 石墨蓝：默认方案（黑白灰蓝，内容站气质）
 * - 百科经典：MC 百科 Logo 的两色，保留社区特征
 * - 暖橙 / 松绿 / 中性：备选强调色
 */
const PRESETS: { group: string; color: string }[] = [
  { group: "石墨蓝", color: "#3b82f6" },
  { group: "石墨蓝（深）", color: "#1e40af" },
  { group: "百科经典（主）", color: "#86c155" },
  { group: "百科经典（副）", color: "#58b6d8" },
  { group: "暖橙", color: "#c15f3c" },
  { group: "暖橙（深）", color: "#a14a2f" },
  { group: "中性灰蓝", color: "#64748b" },
  { group: "中性灰（深）", color: "#334155" },
  { group: "松绿", color: "#0d9488" },
  { group: "松绿（深）", color: "#0f766e" },
];

function getDOMValue() {
  return inputRef.value!.value;
}

function setDOMValue(value: string) {
  inputRef.value!.value = value;
}

/** 点击预设色块：写回原生 input，走与手动取色完全相同的提交链路 */
function pick(color: string) {
  setDOMValue(color);
  onChange();
  activeColor.value = color;
}

function handleNativeChange() {
  onChange();
  activeColor.value = getDOMValue();
}

function getInstance() {
  return inputRef.value!;
}

defineExpose<InputControlRef<string>>({
  getInstance,
  getValue,
  setCurrentValue,
  setDisplayValue,
});
</script>

<style>
.mcmodder-colorpicker-swatches {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.mcmodder-colorpicker-swatch {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--mcmodder-color-background);
  cursor: pointer;
  padding: 0;
}
.mcmodder-colorpicker-swatch.is-active {
  outline: 2px solid var(--mcmodder-color-primary);
  outline-offset: 1px;
}
.mcmodder-colorpicker-native {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--mcmodder-color-background);
  border-radius: 4px;
  background: none;
  cursor: pointer;
  margin-inline-start: 6px;
}
</style>
