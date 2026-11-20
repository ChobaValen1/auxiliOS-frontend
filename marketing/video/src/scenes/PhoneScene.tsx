import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { C, display, mono, sans, out, clamp } from "../theme";
import { Hazard } from "./Hazard";

const Field: React.FC<{ label: string; value: string; delay: number }> = ({ label, value, delay }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        background: C.card,
        border: `2px solid ${C.border}`,
        borderRadius: 16,
        padding: "10px 22px",
        opacity: interpolate(frame, [delay, delay + 8], [0, 1], clamp),
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: C.text, marginTop: 4 }}>{value}</div>
    </div>
  );
};

const Photo: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const done = interpolate(frame, [delay + 6, delay + 10], [0, 1], clamp);
  return (
    <div
      style={{
        flex: 1,
        height: 108,
        borderRadius: 14,
        background: "linear-gradient(160deg, #3a4256 0%, #232836 100%)",
        position: "relative",
        overflow: "hidden",
        scale: interpolate(frame, [delay, delay + 10], [0.4, 1], { ...clamp, easing: Easing.out(Easing.back(1.6)) }),
        opacity: interpolate(frame, [delay, delay + 4], [0, 1], clamp),
      }}
    >
      {/* silueta de auto */}
      <div style={{ position: "absolute", left: "18%", right: "18%", bottom: 34, height: 30, borderRadius: "14px 14px 6px 6px", background: "#59627a" }} />
      <div style={{ position: "absolute", left: "30%", right: "30%", bottom: 58, height: 22, borderRadius: "12px 12px 0 0", background: "#59627a" }} />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 34,
          height: 34,
          borderRadius: "50%",
          background: C.green,
          color: "#0b1a12",
          fontSize: 22,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: done,
        }}
      >
        ✓
      </div>
    </div>
  );
};

// 7–12,5 s: el remito digital en el celular del chofer
export const PhoneScene: React.FC = () => {
  const frame = useCurrentFrame();
  const sent = interpolate(frame, [112, 120], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Hazard />
      <Interactive.Div
        name="Titulo"
        style={{
          position: "absolute",
          top: 250,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: display,
          fontSize: 124,
          lineHeight: 0.95,
          color: C.text,
          opacity: interpolate(frame, [0, 10], [0, 1], { ...clamp }),
        }}
      >
        Con AuxiliOS se hace en el celular
      </Interactive.Div>

      {/* Teléfono */}
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 520,
          width: 580,
          height: 1110,
          borderRadius: 64,
          background: "#05060a",
          border: "4px solid #3a4152",
          boxShadow: `0 40px 120px rgba(0,0,0,0.6), 0 0 0 10px #12151c`,
          padding: 22,
          translate: interpolate(frame, [0, 18], ["0px 500px", "0px 0px"], { ...clamp, easing: out }),
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 44, background: C.bg, overflow: "hidden", padding: "64px 30px 30px" }}>
          {/* notch */}
          <div style={{ position: "absolute", top: 18, left: "50%", marginLeft: -70, width: 140, height: 34, borderRadius: 20, background: "#05060a" }} />
          <div style={{ fontFamily: mono, fontSize: 22, color: C.orange, fontWeight: 700, letterSpacing: 2 }}>REMITO DIGITAL</div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 44, color: C.text, marginTop: 2, marginBottom: 16 }}>Servicio #0482</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field delay={14} label="CLIENTE" value="Aseguradora" />
            <Field delay={18} label="PATENTE" value="AB 123 CD" />
            <Field delay={22} label="SERVICIO" value="Remolque · 18 km" />
          </div>
          <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, marginTop: 18, letterSpacing: 1 }}>FOTOS</div>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <Photo delay={30} />
            <Photo delay={37} />
            <Photo delay={44} />
          </div>
          <div style={{ fontFamily: mono, fontSize: 20, color: C.muted, marginTop: 18, letterSpacing: 1 }}>FIRMA DEL CLIENTE</div>
          <div style={{ marginTop: 10, height: 150, borderRadius: 16, background: "#f3f4f7", position: "relative" }}>
            <svg viewBox="0 0 460 170" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <path
                d="M30 115 C 55 40, 85 35, 92 100 S 120 150, 145 80 S 190 25, 200 100 C 205 135, 235 120, 250 85 S 290 60, 300 100 S 345 130, 360 75 L 380 95 C 395 110, 420 80, 440 70"
                fill="none"
                stroke="#1b2a6b"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={interpolate(frame, [52, 92], [1, 0], { ...clamp, easing: Easing.inOut(Easing.quad) })}
              />
              <line x1={30} y1={140} x2={440} y2={140} stroke="#c6cad6" strokeWidth={2} />
            </svg>
          </div>
          <div
            style={{
              marginTop: 20,
              height: 82,
              borderRadius: 18,
              background: C.orange,
              color: "#14161b",
              fontFamily: sans,
              fontWeight: 700,
              fontSize: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              scale: interpolate(frame, [100, 104, 110], [1, 0.93, 1], clamp),
            }}
          >
            Enviar remito
          </div>

          {/* Confirmación */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15,17,21,0.94)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 26,
              opacity: sent,
            }}
          >
            <div
              style={{
                width: 190,
                height: 190,
                borderRadius: "50%",
                background: C.green,
                color: "#0b1a12",
                fontSize: 120,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scale: interpolate(frame, [112, 126], [0.3, 1], { ...clamp, easing: Easing.out(Easing.back(1.8)) }),
              }}
            >
              ✓
            </div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 52, color: C.text }}>Remito enviado</div>
            <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 32, color: C.muted, textAlign: "center", padding: "0 30px" }}>
              Con fotos y firma. Ya está en la oficina.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
