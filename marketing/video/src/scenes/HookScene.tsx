import { AbsoluteFill, Interactive, interpolate, useCurrentFrame, Easing } from "remotion";
import { C, display, mono, sans, out, clamp } from "../theme";
import { Hazard } from "./Hazard";

// 0–3,5 s: el remito de papel se pierde
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Hazard />
      <Interactive.Div
        name="Linea 1"
        style={{
          position: "absolute",
          top: 270,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: display,
          fontSize: 172,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(frame, [0, 8], [0, 1], { ...clamp }),
          translate: interpolate(frame, [0, 12], ["0px 40px", "0px 0px"], { ...clamp, easing: out }),
        }}
      >
        Un remito perdido
      </Interactive.Div>

      {/* Remito de papel que cae */}
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 640,
          width: 580,
          height: 720,
          background: "#f3efe4",
          borderRadius: 10,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          padding: 44,
          fontFamily: mono,
          color: "#3b3a36",
          translate: interpolate(frame, [0, 16, 44, 70], ["0px -1300px", "0px 0px", "0px 0px", "120px 1500px"], {
            ...clamp,
            easing: [out, Easing.linear, Easing.in(Easing.quad)],
          }),
          rotate: interpolate(frame, [0, 16, 44, 70], ["-14deg", "-4deg", "-4deg", "28deg"], {
            ...clamp,
            easing: [out, Easing.linear, Easing.in(Easing.quad)],
          }),
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 700, borderBottom: "3px solid #3b3a36", paddingBottom: 16 }}>REMITO N° 0482</div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ marginTop: 40, height: 4, background: "#c9c3b4", width: `${92 - (i % 3) * 18}%` }} />
        ))}
        <div style={{ position: "absolute", bottom: 60, left: 44, right: 44, fontSize: 30 }}>
          Firma: ______________
        </div>
        {/* mancha de agua */}
        <div style={{ position: "absolute", top: 260, left: 300, width: 220, height: 200, borderRadius: "50%", background: "rgba(120,100,60,0.18)" }} />
      </div>

      {/* Sello */}
      <Interactive.Div
        name="Sello sin cobrar"
        style={{
          position: "absolute",
          top: 820,
          left: 140,
          right: 140,
          textAlign: "center",
          fontFamily: display,
          fontSize: 150,
          color: C.red,
          border: `12px solid ${C.red}`,
          borderRadius: 18,
          padding: "10px 0 0",
          rotate: "-8deg",
          opacity: interpolate(frame, [62, 66], [0, 1], { ...clamp }),
          scale: interpolate(frame, [62, 72], [2.4, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)), output: "perceptual-scale" }),
        }}
      >
        Sin cobrar
      </Interactive.Div>

      <Interactive.Div
        name="Linea 2"
        style={{
          position: "absolute",
          top: 1150,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 66,
          lineHeight: 1.15,
          color: C.orange,
          opacity: interpolate(frame, [72, 82], [0, 1], { ...clamp }),
          translate: interpolate(frame, [72, 86], ["0px 30px", "0px 0px"], { ...clamp, easing: out }),
        }}
      >
        es un servicio que hiciste y no cobrás.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
