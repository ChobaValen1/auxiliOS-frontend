import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TimeScale } from "./remotion-shim";

// Pasa una composición de 30 fps al nivel del reel nuevo: 60 fps reales, una cámara que respira,
// grano y una viñeta suave. El audio se pega aparte (estas versiones se renderizan sin sonido).
const Grano: React.FC<{ f: number }> = ({ f }) => (
  <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay", pointerEvents: "none" }}>
    <filter id="grano60">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={Math.floor(f / 2) % 24} />
    </filter>
    <rect width="100%" height="100%" filter="url(#grano60)" />
  </svg>
);

export const a60 = <P extends object>(Comp: React.ComponentType<P>): React.FC<P> => {
  const Wrapped: React.FC<P> = (props) => {
    const f = useCurrentFrame();
    const dx = Math.sin(f / 74) * 5 + Math.sin(f / 26) * 1.5;
    const dy = Math.cos(f / 82) * 4 + Math.cos(f / 34) * 1.2;
    return (
      <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
        <AbsoluteFill style={{ scale: 1.018, translate: `${dx}px ${dy}px` }}>
          <TimeScale scale={2}>
            <Comp {...props} />
          </TimeScale>
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 60%, rgba(0,0,0,.28) 100%)", pointerEvents: "none" }} />
        <Grano f={f} />
      </AbsoluteFill>
    );
  };
  return Wrapped;
};
