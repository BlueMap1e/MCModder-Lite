<template>
  <div ref="container" class="mcmodder-themepack">
    <button
      v-for="p in THEME_PRESETS"
      :key="p.id"
      type="button"
      class="mcmodder-themepack-card"
      :class="{ 'is-active': activeId === p.id }"
      :title="`${p.name}（${p.colors[0]} / ${p.colors[1]}）`"
      @click="pick(p)"
    >
      <span class="mcmodder-themepack-chip" :style="{ background: chip(p.colors) }" />
      <span class="mcmodder-themepack-name">{{ p.name }}</span>
    </button>
    <!-- 自定义：只负责展开细调模式（开放主/副配色取色器），不改颜色 -->
    <button
      type="button"
      class="mcmodder-themepack-card"
      :class="{ 'is-active': activeId === 'custom' }"
      title="自定义（开放主配色 / 副配色细调）"
      @click="pickCustom"
    >
      <span class="mcmodder-themepack-chip" :style="{ background: chip(currentColors) }" />
      <span class="mcmodder-themepack-name">自定义</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useInputBase } from "../../composables/useInputBase";
import { THEME_PRESETS, matchThemePreset, type ThemePreset } from "../../../config/themePresets";
import type { InputProps } from "../../../types/props";
import type { ConfigRepository } from "../../../config/ConfigRepository";

interface Props extends InputProps<string> {
  configs: ConfigRepository;
}

const props = defineProps<Props>();

const inputRef = useTemplateRef("container");

const { onChange, getValue, setCurrentValue, setDisplayValue } = useInputBase({
  inputRef,
  value: props.value,
  getDOMValue,
  setDOMValue,
  onSuccessfulChange: props.onSuccessfulChange,
});

/** 当前生效的主/副配色（跟随任何来源的变更，实时渲染「自定义」卡片上的预览条） */
const currentColors = computed(() => [
  props.configs.getSettings("themeColor1") ?? "#3b82f6",
  props.configs.getSettings("themeColor2") ?? "#1e40af",
]);

/** 高亮：优先看存储值（「自定义」是显式选择的模式，手调颜色时保持高亮）；
 *  未存 custom 时按当前颜色反查预设（颜色是唯一事实源），匹配不上回落到存储值 */
const activeId = computed(() => {
  if (props.value === "custom") return "custom";
  return (
    matchThemePreset(currentColors.value[0], currentColors.value[1])?.id ??
    (THEME_PRESETS.some((p) => p.id === props.value) ? props.value : "graphite")
  );
});

function chip(colors: readonly string[]) {
  return `linear-gradient(90deg, ${colors[0]} 0%, ${colors[0]} 45%, ${colors[1]} 55%, ${colors[1]} 100%)`;
}

/** 点击样式包：一次性写入主/副配色（提交后收起自定义细调），并记录包 id */
function pick(p: ThemePreset) {
  props.configs.setSettings("themeColor1", p.colors[0]);
  props.configs.setSettings("themeColor2", p.colors[1]);
  if (props.configs.getSettings("themeCustomColors")) {
    props.configs.setSettings("themeCustomColors", false);
  }
  setDOMValue(p.id);
  onChange();
}

/** 点击自定义：不改颜色，只展开主/副配色取色器（持久化，下次进入保持展开） */
function pickCustom() {
  if (activeId.value !== "custom") {
    props.configs.setSettings("themeCustomColors", true);
    setDOMValue("custom");
    onChange();
  }
}

function getDOMValue() {
  return inputRef.value!.getAttribute("data-value") ?? "";
}

function setDOMValue(value: string) {
  inputRef.value!.setAttribute("data-value", value);
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
.mcmodder-themepack {
  display: inline-flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px;
}
.mcmodder-themepack-card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--mcmodder-color-background-dark3);
  border-radius: 6px;
  background: var(--mcmodder-color-background-dark2);
  cursor: pointer;
  color: var(--mcmodder-color-text-dark1);
}
.mcmodder-themepack-card.is-active {
  border-color: var(--mcmodder-color-primary);
  box-shadow: 0 0 0 1px var(--mcmodder-color-primary);
}
.mcmodder-themepack-chip {
  width: 72px;
  height: 18px;
  border-radius: 3px;
}
.mcmodder-themepack-name {
  font-size: 12px;
  line-height: 1.2;
}
</style>
