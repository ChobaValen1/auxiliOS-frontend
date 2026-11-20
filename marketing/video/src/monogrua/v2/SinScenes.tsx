import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, clamp, mono, sans } from "../../theme";
import { SAFE, StepFrame } from "../StepFrame";
import { Dudas, Handheld, thump, Written } from "./SinFx";

const out = Easing.bezier(0.16, 1, 0.3, 1);

// ❌ Paso 1: suena el teléfono y la tarifa queda en un papelito lleno de dudas
export const Paso1SinV2: React.FC = () => {
  const f = useCurrentFrame();
  const drop = interpolate(f, [0, 12], [-260, 0], { ...clamp, easing: Easing.out(Easing.back(1.3)) });
  const buzz = f < 46 && Math.floor(f / 2) % 4 < 2 ? Math.sin(f * 9) * 7 : 0;
  const slap = interpolate(f, [22, 32], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.5)) });
  const lines: [string, string][] = [
    ["Asist. del Sur", "#2c3550"],
    ["Remolque → Lomas", "#2c3550"],
    ["¿$ 40.000? ¿45?", "#b3261e"],
    ["¿km incluidos??", "#b3261e"],
  ];
  return (
    <StepFrame n={1} mode="sin" title="Te pasan el servicio">
      <Handheld>
        <div
          style={{
            position: "absolute", left: SAFE.left + 20, right: 1080 - SAFE.right + 20, top: 470, background: "#2a2c31", borderRadius: 32, padding: "24px 30px",
            display: "flex", alignItems: "center", gap: 22, translate: `${buzz}px ${drop}px`, opacity: interpolate(f, [0, 6], [0, 1], clamp), zIndex: 3,
          }}
        >
          <div style={{ position: "relative", width: 88, height: 88 }}>
            {[0, 1, 2].map((i) => {
              const t = ((f + i * 10) % 30) / 30;
              return f < 46 ? <div key={i} style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid #3d8f5a", scale: 1 + t * 1.2, opacity: 1 - t }} /> : null;
            })}
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#3d8f5a", display: "grid", placeItems: "center", fontSize: 48, rotate: `${buzz * 2}deg` }}>📞</div>
          </div>
          <div style={{ fontFamily: sans }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: "#e3e5ea" }}>Asistencia del Sur</div>
            <div style={{ fontSize: 30, color: "#9aa0aa" }}>{f < 46 ? "llamando…" : "en llamada · 00:12"}</div>
          </div>
        </div>
        <div
          style={{
            position: "absolute", left: 150, top: 640, width: 720, height: 560, background: "#efe29a", boxShadow: `0 ${10 + slap * 20}px ${30 + slap * 40}px rgba(0,0,0,0.5)`,
            padding: "44px 50px", filter: "saturate(0.75)", opacity: slap, scale: 1.6 - slap * 0.6, rotate: `${-14 + slap * 10}deg`,
          }}
        >
          {lines.map(([l, col], i) => (
            <div key={l}>
              <Written text={l} from={34 + i * 12} dur={11} size={82} color={col} />
            </div>
          ))}
        </div>
        <Dudas from={74} spots={[[780, 760], [120, 900], [820, 1060]]} />
      </Handheld>
      <Audio name="Papel" src={staticFile("sfx/page-turn.wav")} from={22} volume={0.6} />
    </StepFrame>
  );
};

// ❌ Paso 2: el talonario, a mano, sin fotos y con el sello
export const Paso2SinV2: React.FC = () => {
  const f = useCurrentFrame();
  const sheet = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: out });
  const STAMP = 72;
  const hit = thump(f, STAMP + 4);
  const wind = Math.sin(f / 9) * 1.2;
  const stamp = interpolate(f, [STAMP, STAMP + 6], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const lines = ["Asist. del Sur", "Pat. AB 123 C…", "Luis Guillón → Lomas", "Fotos: —"];
  return (
    <StepFrame n={2} mode="sin" title="El remito">
      <Handheld>
        <div style={{ position: "absolute", inset: 0, translate: `${hit.x}px ${hit.y}px` }}>
          <div style={{ position: "absolute", left: 180, top: 500, width: 720, height: 720, background: "#cfd6ea", rotate: `${3 + wind * 0.6}deg`, opacity: sheet * 0.9, translate: `0px ${(1 - sheet) * 300}px` }} />
          <div
            style={{
              position: "absolute", left: 150, top: 470, width: 720, height: 720, background: "#ece6d6", boxShadow: "0 24px 60px rgba(0,0,0,.5)", padding: "34px 44px",
              translate: `0px ${(1 - sheet) * 340}px`, rotate: `${-2 + (1 - sheet) * 12 + wind}deg`, transform: `skewY(${wind * 0.8}deg)`, opacity: sheet, filter: "saturate(0.7)", transformOrigin: "50% 0%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 34, color: "#3d3a33", borderBottom: "3px solid #3d3a33", paddingBottom: 10 }}>
              <span>REMITO</span>
              <span style={{ color: "#a33" }}>N° 0482</span>
            </div>
            <div style={{ marginTop: 14 }}>
              {lines.map((l, i) => (
                <div key={l}>
                  <Written text={l} from={16 + i * 10} dur={9} size={64} color="#2a3a8a" />
                </div>
              ))}
            </div>
            <div style={{ position: "absolute", left: 44, right: 44, bottom: 40, borderTop: "2px dashed #8a8372", paddingTop: 6, fontFamily: mono, fontSize: 24, color: "#5b574c" }}>Firma</div>
            <svg viewBox="0 0 400 120" width={400} height={120} style={{ position: "absolute", left: 70, bottom: 70, overflow: "visible" }}>
              <path
                d="M10 80 C 40 10, 60 110, 90 50 S 130 20, 140 70 L 170 40 C 190 90, 210 20, 240 60 S 300 90, 390 30"
                fill="none" stroke="#24306a" strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1}
                strokeDashoffset={interpolate(f, [58, 64], [1, 0], clamp)}
              />
            </svg>
          </div>
        </div>
        <div
          style={{
            position: "absolute", left: 430, top: 840, fontFamily: mono, fontWeight: 700, fontSize: 64, color: C.red, border: `8px solid ${C.red}`, padding: "8px 26px",
            rotate: "-12deg", opacity: stamp, scale: 2.6 - stamp * 1.6, boxShadow: stamp >= 1 ? "0 0 0 4px rgba(226,80,74,.15)" : "none",
          }}
        >
          SIN FOTOS
        </div>
      </Handheld>
      <Audio name="Papel" src={staticFile("sfx/page-turn.wav")} from={0} volume={0.6} />
      <Audio name="Sello" src={staticFile("sfx/whip.wav")} from={STAMP + 3} volume={0.8} />
    </StepFrame>
  );
};

// ❌ Paso 3: el cuaderno de cobros y una llamada que nadie atiende
export const Paso3SinV2: React.FC = () => {
  const f = useCurrentFrame();
  const open = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: out });
  const lines: [string, string][] = [
    ["Asist. del Sur · 4 remitos", "#2a3a8a"],
    ["¿Me pagó? ¿Cuándo vence?", "#b3261e"],
    ["Cobré: 52.500 + 45… + ¿?", "#2a3a8a"],
    ["¿Cuánto me quedó?", "#b3261e"],
  ];
  const call = interpolate(f, [56, 66], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const ringing = f >= 56 && f < 80;
  return (
    <StepFrame n={3} mode="sin" title="Cobrar el servicio">
      <Handheld>
        <div style={{ position: "absolute", inset: 0, perspective: 1800 }}>
          <div
            style={{
              position: "absolute", left: 130, top: 500, width: 780, height: 640, transformOrigin: "0% 50%", rotate: `y ${(1 - open) * -80}deg`, opacity: Math.min(1, open * 2),
              background: "repeating-linear-gradient(180deg, #f4f1e8 0 70px, #b9c7dd 70px 72px)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)", borderLeft: "8px solid #d86a6a",
              padding: "34px 40px 0 56px", filter: "saturate(0.7)",
            }}
          >
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: "#5b574c", letterSpacing: 3, height: 72 }}>COBROS · NOV</div>
            {lines.map(([l, col], i) => (
              <div key={l} style={{ position: "relative", height: 72 }}>
                <Written text={l} from={14 + i * 11} dur={10} size={60} color={col} style={{ lineHeight: "72px" }} />
                {i === 2 ? <div style={{ position: "absolute", left: -6, top: 36, height: 6, background: "#b3261e", width: interpolate(f, [50, 58], [0, 580], clamp), rotate: "-3deg" }} /> : null}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute", left: SAFE.left + 60, right: 1080 - SAFE.right + 60, top: 1060, background: "#2a2c31", borderRadius: 30, padding: "20px 26px",
            display: "flex", alignItems: "center", gap: 20, opacity: call, scale: 0.7 + call * 0.3, translate: `${ringing ? Math.sin(f * 9) * 5 : 0}px 0px`,
          }}
        >
          <div style={{ width: 76, height: 76, borderRadius: "50%", background: f >= 80 ? "#b3261e" : "#3d8f5a", display: "grid", placeItems: "center", fontSize: 40 }}>{f >= 80 ? "✕" : "📞"}</div>
          <div style={{ fontFamily: sans }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: "#e3e5ea" }}>Asistencia del Sur</div>
            <div style={{ fontSize: 28, color: f >= 80 ? "#f0716b" : "#9aa0aa" }}>{f >= 80 ? "No contesta" : "llamando…"}</div>
          </div>
        </div>
        <Dudas from={62} spots={[[800, 560], [100, 760]]} />
      </Handheld>
      <Audio name="Cuaderno" src={staticFile("sfx/page-turn.wav")} from={0} volume={0.6} />
    </StepFrame>
  );
};
