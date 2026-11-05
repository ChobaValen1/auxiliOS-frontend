import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Anim } from "./ui";

export type Step = { from: number; tap?: number; render: (f: number) => React.ReactNode };

const SLIDE = 9;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

// Pantallas de la app una tras otra: la nueva entra desde la derecha, la anterior se corre y se oscurece
export const Flow: React.FC<{ steps: Step[] }> = ({ steps }) => {
  const f = useCurrentFrame();
  const cur = steps.reduce((k, s, i) => (f >= s.from ? i : k), 0);
  const show = [cur - 1, cur].filter((i) => i >= 0 && f < steps[cur].from + SLIDE);
  const idx = show.length === 2 ? show : [cur];
  return (
    <AbsoluteFill style={{ background: "#0c0e12", overflow: "hidden" }}>
      {idx.map((i) => {
        const s = steps[i];
        const local = f - s.from;
        const p = interpolate(f, [steps[cur].from, steps[cur].from + SLIDE], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        const isNew = i === cur && cur > 0;
        const isOld = i !== cur;
        const x = isNew ? (1 - p) * 100 : isOld ? -p * 30 : 0;
        return (
          <AbsoluteFill key={i} style={{ translate: `${x}% 0px`, zIndex: isNew ? 2 : 1 }}>
            <Anim.Provider value={{ f: local, tapAt: s.tap === undefined ? undefined : s.tap - s.from }}>{s.render(local)}</Anim.Provider>
            {isOld ? <AbsoluteFill style={{ background: "#000", opacity: p * 0.45 }} /> : null}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// Texto que se va escribiendo
export const typed = (text: string, f: number, a: number, b: number) => {
  const n = Math.round(interpolate(f, [a, b], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return text.slice(0, n);
};
