import type { ColorKey } from "./config/schema";

/** Bảng màu status dùng chung (xem DESIGN.md mục 7). */
export const COLORS: Record<ColorKey, { bg: string; fg: string }> = {
  green: { bg: "#00c875", fg: "#ffffff" },
  orange: { bg: "#fdab3d", fg: "#ffffff" },
  red: { bg: "#df2f4a", fg: "#ffffff" },
  blue: { bg: "#579bfc", fg: "#ffffff" },
  purple: { bg: "#a25ddc", fg: "#ffffff" },
  darkblue: { bg: "#0086c0", fg: "#ffffff" },
  grass: { bg: "#9cd326", fg: "#ffffff" },
  sky: { bg: "#66ccff", fg: "#1f2937" },
  berry: { bg: "#bb3354", fg: "#ffffff" },
  pink: { bg: "#ff158a", fg: "#ffffff" },
  yellow: { bg: "#ffcb00", fg: "#1f2937" },
  gray: { bg: "#c4c4c4", fg: "#ffffff" },
};

export const color = (k: string | undefined) => COLORS[(k as ColorKey) ?? "gray"] ?? COLORS.gray;

const AVATAR = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#0086c0", "#ff158a", "#bb3354"];
export function avatarColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
