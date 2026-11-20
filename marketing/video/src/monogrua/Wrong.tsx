import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { clamp } from "../theme";

// «Esto está mal»: la escena sin AuxiliOS tiembla, se tiñe de rojo y una ✕ enorme la tacha
export const Wrong: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const f = useCurrentFrame();
  const t = f - at;
  const on = t >= 0;
  const shake = on ? interpolate(t, [0, 14], [1, 0], clamp) : 0;
  const dx = Math.sin(t * 2.7) * 22 * shake;
  const dy = Math.cos(t * 3.3) * 10 * shake;
  const tint = interpolate(t, [0, 4, 30], [0, 0.42, 0.3], clamp);
  const stroke = (from: number) => interpolate(t, [from, from + 6], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ translate: `${dx}px ${dy}px`, filter: on ? `grayscale(${interpolate(t, [0, 8], [0, 0.6], clamp)})` : undefined }}>{children}</AbsoluteFill>
      {on ? (
        <>
          <AbsoluteFill style={{ background: "#b3261e", opacity: tint, mixBlendMode: "multiply" }} />
          <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(120,0,0,.55))", opacity: interpolate(t, [0, 6], [0, 1], clamp) }} />
          <svg viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {[
              ["M210 520 L870 1180", 0],
              ["M870 520 L210 1180", 5],
            ].map(([d, from]) => (
              <g key={d as string}>
                <path d={d as string} stroke="#fff" strokeWidth={96} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={stroke(from as number)} opacity={0.9} />
                <path d={d as string} stroke="#e2504a" strokeWidth={70} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={stroke(from as number)} />
              </g>
            ))}
          </svg>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
