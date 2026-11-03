import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: v("primary"), hover: v("primary-hover"), selected: v("primary-selected") },
        bg: v("bg"),
        surface: { DEFAULT: v("surface"), 2: v("surface-2") },
        ink: { DEFAULT: v("ink"), 2: v("ink-2") },
        line: { DEFAULT: v("line"), soft: v("line-soft") },
        hover: v("row-hover"),
      },
      fontFamily: {
        sans: ["Figtree", "Roboto", "system-ui", "sans-serif"],
        title: ["Poppins", "Figtree", "system-ui", "sans-serif"],
      },
      boxShadow: { panel: "0 6px 20px rgba(0,0,0,.18)", card: "0 1px 3px rgba(0,0,0,.08)" },
    },
  },
  plugins: [],
} satisfies Config;
