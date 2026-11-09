/**
 * 主题样式包预设：一套 = 主配色 + 副配色（同色系深浅档，配套设计）。
 *
 * 取色参考（气质参照而非照搬，百科灰阶与之有差异）：
 * - 石墨蓝：默认方案，黑白灰蓝的内容站气质；
 * - 百科经典：MC 百科 Logo 的绿/蓝两色，保留社区特征；
 * - 暖橙：Claude Code 系珊瑚橙的近似；
 * - 中性灰：ZCode 系无彩灰阶（原「中性」偏蓝调，已去冷）；
 * - 黛紫：DeepSeek / Copilot 系蓝紫，替代冷门的松绿。
 */

export interface ThemePreset {
  id: "graphite" | "wiki" | "warm" | "gray" | "iris";
  name: string;
  colors: readonly [string, string];
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { id: "graphite", name: "石墨蓝", colors: ["#3b82f6", "#1e40af"] },
  { id: "wiki", name: "百科经典", colors: ["#86c155", "#58b6d8"] },
  { id: "warm", name: "暖橙", colors: ["#d97757", "#a14a2f"] },
  { id: "gray", name: "中性灰", colors: ["#8b8f98", "#4b5058"] },
  { id: "iris", name: "黛紫", colors: ["#6f6af8", "#46409f"] },
];

/** 含「自定义」在内的全部合法 themePreset 存储值 */
export type ThemePresetId = ThemePreset["id"] | "custom";

/** 按当前主/副配色反查样式包；精确匹配不上（含用户手调）时返回 null */
export function matchThemePreset(c1?: string, c2?: string): ThemePreset | null {
  if (!c1 || !c2) return null;
  const a = c1.toLowerCase();
  const b = c2.toLowerCase();
  return (
    THEME_PRESETS.find((p) => p.colors[0].toLowerCase() === a && p.colors[1].toLowerCase() === b) ??
    null
  );
}
