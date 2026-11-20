import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display } from "../theme";
import { Truck } from "./Truck";
import { AMBER, BAND_H, BAND_TOP, HALF_H, PAPER_BG, PAPER_TOP, SOLO_TOP } from "./ui";

export const INTRO_DUR = 90;

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const drive = interpolate(f, [0, 40], [-900, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const wheel = (drive / (2 * Math.PI * 30)) * 360;
  const exit = interpolate(f, [82, 90], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0b0e" }}>
      <div style={{ position: "absolute", top: PAPER_TOP, left: 0, right: 0, height: HALF_H, background: PAPER_BG }}>
        <div style={{ position: "absolute", left: 320, top: 290, translate: `${drive}px 0px`, scale: 1.45, opacity: exit }}>
          <Truck solo={false} wheelTurn={wheel} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 520, height: 6, background: "#333" }} />
        <div style={{ position: "absolute", left: 60, top: 60, fontFamily: display, fontSize: 96, color: "#9a9ea6", opacity: interpolate(f, [30, 40], [0, 1], clamp) }}>Con papel</div>
      </div>
      <div style={{ position: "absolute", top: SOLO_TOP, left: 0, right: 0, height: HALF_H, background: `radial-gradient(ellipse at 50% 100%, rgba(245,166,35,0.16), transparent 60%), ${C.bg}` }}>
        <div style={{ position: "absolute", left: 320, top: 290, translate: `${drive}px 0px`, scale: 1.45, opacity: exit }}>
          <Truck solo wheelTurn={wheel} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 520, height: 6, background: "#2a3040" }} />
        <div style={{ position: "absolute", left: 60, top: 60, fontFamily: display, fontSize: 96, color: AMBER, opacity: interpolate(f, [36, 46], [0, 1], clamp) }}>Con AuxiliOS Solo</div>
      </div>
      <div
        style={{
          position: "absolute",
          top: BAND_TOP,
          left: 0,
          right: 0,
          height: BAND_H,
          background: `repeating-linear-gradient(-45deg, ${C.yellow} 0 22px, #111 22px 44px)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Interactive.Div
          name="Titulo intro"
          style={{
            background: "#0a0b0e",
            border: `3px solid ${C.yellow}`,
            borderRadius: 999,
            padding: "10px 44px 4px",
            fontFamily: display,
            fontSize: 74,
            color: C.text,
            letterSpacing: 2,
            scale: interpolate(f, [6, 20], [0.6, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }),
            opacity: interpolate(f, [6, 12], [0, 1], { ...clamp }),
          }}
        >
          Mismo día. Mismos servicios.
        </Interactive.Div>
      </div>
    </AbsoluteFill>
  );
};
