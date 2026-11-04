import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

// Tipografías locales (public/fonts) para que el render no dependa de la red
const fonts: [string, string, string][] = [
  ["Bebas Neue", "400", "bebas-neue-latin-400-normal.woff2"],
  ["DM Sans", "500", "dm-sans-latin-500-normal.woff2"],
  ["DM Sans", "700", "dm-sans-latin-700-normal.woff2"],
  ["JetBrains Mono", "500", "jetbrains-mono-latin-500-normal.woff2"],
  ["JetBrains Mono", "700", "jetbrains-mono-latin-700-normal.woff2"],
  ["Caveat", "700", "caveat-latin-700-normal.woff2"],
];
for (const [family, weight, file] of fonts) {
  loadFont({ family, weight, url: staticFile(`fonts/${file}`) });
}

export const display = "'Bebas Neue', sans-serif";
export const sans = "'DM Sans', sans-serif";
export const mono = "'JetBrains Mono', monospace";
export const hand = "'Caveat', cursive";

export const C = {
  bg: "#0f1115",
  panel: "#161a22",
  card: "#1c212c",
  border: "#2a3040",
  orange: "#ff6b1a",
  yellow: "#f5c400",
  text: "#eef0f4",
  muted: "#8590ab",
  red: "#e2504a",
  green: "#27c47a",
};

export const out = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const W = 1080;
export const H = 1920;
export const FPS = 30;
