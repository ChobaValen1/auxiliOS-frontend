import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono } from "../theme";
import { AMBER, BAND_H, BAND_TOP, HALF_H, PAPER_BG, PAPER_TOP, SOLO_TOP } from "./ui";

const Tag: React.FC<{ solo: boolean }> = ({ solo }) => (
  <div
    style={{
      position: "absolute",
      left: 50,
      top: -26,
      zIndex: 5,
      padding: "10px 24px",
      borderRadius: 999,
      fontFamily: mono,
      fontWeight: 700,
      fontSize: 26,
      letterSpacing: 2,
      background: solo ? AMBER : "#3a3c42",
      color: solo ? "#14161b" : "#c9ccd2",
    }}
  >
    {solo ? "CON AUXILIOS SOLO" : "CON PAPEL"}
  </div>
);

// Marco común: mitad papel arriba, reloj en el medio, mitad Solo abajo
export const Split: React.FC<{
  dur: number;
  time: string;
  prevTime?: string;
  label: string;
  paper: React.ReactNode;
  solo: React.ReactNode;
}> = ({ dur, time, prevTime, label, paper, solo }) => {
  const f = useCurrentFrame();
  const enter = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const exit = interpolate(f, [dur - 8, dur], [1, 0], clamp);
  const content: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    opacity: Math.min(enter, exit),
    translate: `${(1 - enter) * 140}px 0px`,
  };
  const clockSlide = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0b0e" }}>
      {/* Mitad papel */}
      <div style={{ position: "absolute", top: PAPER_TOP, left: 0, right: 0, height: HALF_H, background: `repeating-linear-gradient(0deg, ${PAPER_BG} 0 6px, #1e1f22 6px 12px)`, filter: "saturate(0.6)" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={content}>{paper}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: PAPER_TOP + 26, left: 0, right: 0 }}>
        <Tag solo={false} />
      </div>

      {/* Mitad Solo */}
      <div style={{ position: "absolute", top: SOLO_TOP, left: 0, right: 0, height: HALF_H, background: `radial-gradient(ellipse at 25% 100%, rgba(245,166,35,0.14), transparent 60%), ${C.bg}` }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <div style={{ ...content, top: 90 }}>{solo}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: SOLO_TOP + 26, left: 0, right: 0 }}>
        <Tag solo />
      </div>

      {/* Banda central con reloj */}
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
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22, background: "#0a0b0e", borderRadius: 999, padding: "6px 36px", border: `3px solid ${C.yellow}` }}>
          <div style={{ position: "relative", height: 76, width: 190, overflow: "hidden" }}>
            {prevTime ? (
              <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 82, lineHeight: "80px", color: C.text, textAlign: "center", translate: `0px ${-clockSlide * 80}px` }}>{prevTime}</div>
            ) : null}
            <div style={{ position: "absolute", inset: 0, fontFamily: display, fontSize: 82, lineHeight: "80px", color: C.yellow, textAlign: "center", translate: `0px ${prevTime ? (1 - clockSlide) * 80 : 0}px` }}>{time}</div>
          </div>
          <div style={{ fontFamily: display, fontSize: 56, color: C.text, letterSpacing: 2, opacity: enter }}>{label}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
