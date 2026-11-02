<template>
  <div class="mcmodder-colorpicker">
    <!-- 预设色块：按组合分组（每组两色是配套设计的），全部经过亮/夜两底对比度筛查 -->
    <div class="mcmodder-colorpicker-swatches">
      <span
        v-for="group in PRESET_GROUPS"
        :key="group.name"
        class="mcmodder-colorpicker-group"
        :title="group.name"
      >
        <button
          v-for="preset in group.colors"
          :key="preset.color"
          type="button"
          class="mcmodder-colorpicker-swatch"
          :class="{ 'is-active': preset.color === activeColor }"
          :style="{ background: preset.color }"
          :title="`${group.name} ${preset.color}`"
          :aria-label="`${group.name} ${preset.color}`"
          @click="pick(preset.color)"
        />
      </span>
      <!-- 原生取色器兜底：完全自定义时使用。做成文字标签以免被误认为预设色块 -->
      <label
        class="mcmodder-colorpicker-custom"
        :class="{ 'is-active': !isPresetColor }"
        :title="title + '（自定义颜色）'"
      >
        自定义
        <input
          ref="inputRef"
          type="color"
          class="mcmodder-colorpicker-native"
          :aria-label="title"
          @change="handleNativeChange"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
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
 * 每组两色是**配套设计**（同色系深浅档），主/副配色各取一组即可得到平和的渐变；
 * 也允许跨组自由组合，但双色相混搭会重新引入视觉冲突，组间距即为提示。
 * - 石墨蓝：默认方案（黑白灰蓝，内容站气质）
 * - 百科经典：MC 百科 Logo 的两色，保留社区特征
 * - 暖橙 / 松绿 / 中性：备选强调色
 */
const PRESET_GROUPS: { name: string; colors: string[] }[] = [
  { name: "石墨蓝", colors: ["#3b82f6", "#1e40af"] },
  { name: "百科经典", colors: ["#86c155", "#58b6d8"] },
  { name: "暖橙", colors: ["#c15f3c", "#a14a2f"] },
  { name: "中性", colors: ["#64748b", "#334155"] },
  { name: "松绿", colors: ["#0d9488", "#0f766e"] },
];

const PRESET_COLORS = new Set(PRESET_GROUPS.flatMap((g) => g.colors));

const isPresetColor = computed(() => PRESET_COLORS.has(activeColor.value));

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
  gap: 4px 14px;
}
.mcmodder-colorpicker-group {
  display: inline-flex;
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
.mcmodder-colorpicker-custom {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--mcmodder-color-text-dark1);
  border-radius: 4px;
  color: var(--mcmodder-color-text-dark1);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  position: relative;
}
.mcmodder-colorpicker-custom.is-active {
  outline: 2px solid var(--mcmodder-color-primary);
  outline-offset: 1px;
}
/* 原生 input 藏进标签里（点击标签即触发），DOM 上保留以承接取值链路 */
.mcmodder-colorpicker-native {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  border: none;
  padding: 0;
}
</style>
