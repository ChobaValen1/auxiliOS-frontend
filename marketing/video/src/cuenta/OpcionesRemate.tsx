import React from "react";
import { AbsoluteFill, random } from "remotion";
import { display, hand, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { Billete } from "../reel/Gancho";
import { Grua } from "./Grua";
import { AMBER, Icono, peso, W } from "./Fase1";
import { CELESTE, CORAL } from "./MapaFijo";

// Tres propuestas para el remate de la fase 2: el golpe del mes (−$ 4.040 × 2 por semana) y el
// puente «Esta cuenta nadie la hace en la banquina. Por eso la hace la app».
// Cada opción tiene dos cuadros: 1 = el mes, 2 = el puente.
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const INK = "#14161b";
const GRIS = "#9aa3b8";
const PIERDE = 4040;
const MES = PIERDE * 8; // 32.320
const NOCHE = "radial-gradient(ellipse at 50% 40%, #1a2236, #070a12 75%)";

const Rotulo: React.FC<{ op: string; t: string }> = ({ op, t }) => (
  <div style={{ position: "absolute", top: 1180, left: IN_L, width: IN_W, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: "rgba(255,255,255,.45)" }}>
    OPCIÓN {op} · {t}
  </div>
);
const Golpe: React.FC<{ top: number; size?: number; children: React.ReactNode }> = ({ top, size = 170, children }) => (
  <div style={{ position: "absolute", top, left: IN_L - 40, width: IN_W + 80, textAlign: "center", fontFamily: display, fontSize: size, lineHeight: 1, color: CORAL, textShadow: "0 14px 60px rgba(255,122,107,.35)" }}>{children}</div>
);
const Frase: React.FC<{ top: number; color?: string; children: React.ReactNode }> = ({ top, color = "#f2f3f6", children }) => (
  <div style={{ position: "absolute", top, left: IN_L - 20, width: IN_W + 40, textAlign: "center", fontFamily: display, fontSize: 104, lineHeight: 0.95, color, textShadow: "0 12px 50px rgba(0,0,0,.6)" }}>{children}</div>
);
const Chip: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999, fontFamily: mono, fontWeight: 700, fontSize: 26, ...style }}>{children}</span>
);
// la banquina de noche, con la grúa parada y las balizas
const Banquina: React.FC<{ grua?: boolean }> = ({ grua = true }) => (
  <>
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #05070c 0%, #0c1220 50%, #121826 66%, #07080b 100%)" }} />
    {Array.from({ length: 9 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: -80 + i * 140, top: 960 - (100 + random(`b${i}`) * 120), width: 120, height: 100 + random(`b${i}`) * 120, background: "#0b0f18" }} />
    ))}
    <div style={{ position: "absolute", left: 0, right: 0, top: 960, height: 6, background: "#1c2230" }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 966, bottom: 0, background: "linear-gradient(180deg, #11141b, #07080b)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 1000, height: 6, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 70px, transparent 70px 120px)" }} />
    {/* reflejo naranja de las balizas */}
    <div style={{ position: "absolute", left: 120, top: 640, width: 840, height: 520, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,140,40,.22), transparent 65%)" }} />
    {grua ? (
      <div style={{ position: "absolute", left: 160, top: 712 }}>
        <Grua giro={0} encendida baliza width={760} />
      </div>
    ) : null}
  </>
);

// ── Opción A · la pila de billetes que se vacía ─────────────────────
const A1: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: NOCHE }} />
    <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, display: "flex", justifyContent: "center", gap: 12 }}>
      {[1, 2, 3, 4].map((s) => (
        <Chip key={s} style={{ background: s <= 4 ? "rgba(255,122,107,.16)" : "#1c1f28", color: s <= 4 ? CORAL : GRIS, border: `2px solid ${s === 4 ? CORAL : "rgba(255,122,107,.3)"}` }}>
          SEMANA {s}
        </Chip>
      ))}
    </div>
    <div style={{ position: "absolute", top: 380, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#dfe3ea" }}>Si te pasa 2 veces por semana…</div>
    {/* la pila, ya flaca */}
    <div style={{ position: "absolute", left: 540 - 280, top: 820, width: 560, height: 260 }}>
      {Array.from({ length: 5 }).map((_, i) => <Billete key={i} style={{ left: 0, top: -i * 11, filter: `brightness(${0.75 + i * 0.06})` }} />)}
    </div>
    {/* los billetes que se llevan los traslados */}
    {[
      { x: 40, y: 640, r: -24, s: 0.42 },
      { x: 700, y: 600, r: 30, s: 0.38 },
      { x: 90, y: 1040, r: 18, s: 0.34 },
      { x: 760, y: 1010, r: -16, s: 0.36 },
    ].map((b, i) => (
      <div key={i} style={{ position: "absolute", left: b.x, top: b.y, rotate: `${b.r}deg`, scale: b.s, transformOrigin: "0 0", opacity: 0.85 }}>
        <Billete style={{ left: 0, top: 0 }} label="− $ 4.040" />
      </div>
    ))}
    {[{ x: 70, y: 520 }, { x: 640, y: 500 }].map((c, i) => (
      <div key={i} style={{ position: "absolute", left: c.x, top: c.y, padding: "12px 18px", borderRadius: 20, background: "rgba(40,45,58,.95)", fontFamily: sans, fontWeight: 700, fontSize: 24, color: "#eef0f5", boxShadow: "0 16px 30px rgba(0,0,0,.5)" }}>
        Traslado · <span style={{ color: AMBER }}>$ 38.000</span> <span style={{ color: CORAL }}>− $ 4.040</span>
      </div>
    ))}
    <Golpe top={1090} size={150}>− {peso(MES)} al mes</Golpe>
    <Rotulo op="A" t="EL MES" />
  </>
);
const A2: React.FC = () => (
  <>
    <Banquina />
    <Frase top={330}>
      Esta cuenta nadie
      <br />
      la hace <span style={{ color: AMBER }}>en la banquina.</span>
    </Frase>
    {/* el barrido de luz hacia la app */}
    <div style={{ position: "absolute", right: -200, top: 0, bottom: 0, width: 520, background: "linear-gradient(90deg, rgba(238,240,244,0), rgba(238,240,244,.85) 60%, #fff)", filter: "blur(20px)" }} />
    <div style={{ position: "absolute", top: 1090, left: 0, right: 0, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 36, color: "#dfe3ea" }}>→ barrido con flash a «La cuenta la hace la app»</div>
    <Rotulo op="A" t="EL PUENTE" />
  </>
);

// ── Opción B · el contador de surtidor que corre para atrás ─────────
const Rodillo: React.FC<{ d: string; prox?: string }> = ({ d, prox }) => (
  <div style={{ position: "relative", width: 118, height: 190, borderRadius: 18, overflow: "hidden", background: "linear-gradient(180deg, #050608 0%, #1a1d24 22%, #20242d 50%, #1a1d24 78%, #050608 100%)", border: "3px solid #2e3440" }}>
    {prox ? <div style={{ position: "absolute", left: 0, right: 0, top: -96, textAlign: "center", fontFamily: display, fontSize: 150, color: CORAL, opacity: 0.35 }}>{prox}</div> : null}
    <div style={{ position: "absolute", left: 0, right: 0, top: 18, textAlign: "center", fontFamily: display, fontSize: 150, lineHeight: 1, color: CORAL, textShadow: "0 0 30px rgba(255,122,107,.45)" }}>{d}</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 93, height: 3, background: "rgba(0,0,0,.6)" }} />
  </div>
);
const Bucle: React.FC<{ x: number; y: number; hecho: boolean }> = ({ x, y, hecho }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 150, height: 110 }}>
    <svg width={150} height={110} viewBox="0 0 150 110">
      <path d="M20 90 L40 30 L120 40 L130 90 Z" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={8} strokeLinejoin="round" />
      <path d="M20 90 L40 30" fill="none" stroke={CELESTE} strokeWidth={8} strokeLinecap="round" />
      <path d="M40 30 L120 40" fill="none" stroke={AMBER} strokeWidth={8} strokeLinecap="round" />
      {hecho ? <path d="M120 40 L130 90 L20 90" fill="none" stroke={CORAL} strokeWidth={8} strokeDasharray="2 12" strokeLinecap="round" /> : null}
    </svg>
    {hecho ? <div style={{ position: "absolute", left: 0, right: 0, top: 96, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 20, color: CORAL }}>− $ 4.040</div> : null}
  </div>
);
const B1: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: NOCHE }} />
    <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, display: "flex", justifyContent: "center", gap: 12 }}>
      <Chip style={{ background: "rgba(255,122,107,.16)", color: CORAL, border: `2px solid ${CORAL}` }}>×2 POR SEMANA</Chip>
      <Chip style={{ background: "#1c1f28", color: GRIS, border: "2px solid #2e3440" }}>× 4 SEMANAS</Chip>
    </div>
    {Array.from({ length: 8 }).map((_, i) => (
      <Bucle key={i} x={IN_L + 10 + (i % 4) * 210} y={380 + Math.floor(i / 4) * 150} hecho={i < 8} />
    ))}
    {/* el contador mecánico, como el de un surtidor */}
    <div style={{ position: "absolute", top: 720, left: IN_L - 10, width: IN_W + 20, borderRadius: 34, background: "linear-gradient(180deg, #2a2f3a, #14161b)", padding: "26px 22px 22px", boxShadow: "0 30px 60px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,255,255,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: GRIS, marginBottom: 14 }}>
        <span>LO QUE SE TE VA</span>
        <span>POR MES</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span style={{ fontFamily: display, fontSize: 130, color: CORAL, marginRight: 6 }}>− $</span>
        {["3", "2", "3", "2", "0"].map((d, i) => (
          <React.Fragment key={i}>
            {i === 2 ? <span style={{ fontFamily: display, fontSize: 130, color: CORAL }}>.</span> : null}
            <Rodillo d={d} prox={i === 4 ? "4" : undefined} />
          </React.Fragment>
        ))}
      </div>
    </div>
    <div style={{ position: "absolute", top: 1060, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#dfe3ea" }}>Sin enterarte.</div>
    <Rotulo op="B" t="EL MES" />
  </>
);
const B2: React.FC = () => (
  <>
    <Banquina grua={false} />
    {/* parabrisas con gotas */}
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(255,140,40,.12), transparent 60%)" }} />
    {Array.from({ length: 60 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: random(`gx${i}`) * 1080, top: 200 + random(`gy${i}`) * 700, width: 6 + random(`gs${i}`) * 10, height: 10 + random(`gs${i}`) * 16, borderRadius: "50%", background: "rgba(200,220,255,.18)" }} />
    ))}
    {/* el tablero de la grúa */}
    <div style={{ position: "absolute", left: -60, right: -60, top: 980, bottom: -60, borderRadius: "60px 60px 0 0", background: "linear-gradient(180deg, #1d212b, #0b0d12)", boxShadow: "0 -20px 60px rgba(0,0,0,.6)" }} />
    <div style={{ position: "absolute", left: 120, top: 1040, width: 300, height: 120, borderRadius: 24, background: "#0b0d12", border: "3px solid #2e3440", display: "grid", placeItems: "center", fontFamily: display, fontSize: 72, color: CORAL, textShadow: "0 0 20px rgba(255,122,107,.5)" }}>
      − $ 32.320
    </div>
    {/* el celular en el soporte, que se prende */}
    <div style={{ position: "absolute", left: 620, top: 820, width: 270, height: 480, borderRadius: 40, background: "#0b0d12", border: "6px solid #2a2f3a", padding: 14, boxShadow: "0 0 80px rgba(238,240,244,.35)" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 28, background: "radial-gradient(ellipse at 50% 30%, #fff, #eef0f4 70%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: INK }}>
          <span style={{ color: "#ff6b1a" }}>[</span>Auxili<span style={{ color: "#ff6b1a" }}>]</span>
          <span style={{ background: "#ff6b1a", color: "#fff", padding: "0 6px", marginLeft: 4, borderRadius: 4 }}>OS</span>
        </div>
        <div style={{ width: 120, height: 120, borderRadius: "50%", border: `22px solid ${AMBER}`, borderRightColor: "#565e70" }} />
      </div>
    </div>
    <Frase top={330}>
      Esta cuenta nadie
      <br />
      la hace <span style={{ color: AMBER }}>en la banquina.</span>
    </Frase>
    <div style={{ position: "absolute", top: 640, left: 560, width: 380, fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#dfe3ea", textAlign: "center" }}>→ la cámara entra en el celular y aparece la fase 3</div>
    <Rotulo op="B" t="EL PUENTE" />
  </>
);

// ── Opción C · barras por semana y pantalla partida ─────────────────
const C1: React.FC = () => {
  const cero = 470, bloque = 150, BW = 150, GAP = 46, x0 = 540 - (4 * BW + 3 * GAP) / 2;
  return (
    <>
      <AbsoluteFill style={{ background: NOCHE }} />
      <div style={{ position: "absolute", top: 300, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#dfe3ea" }}>Si te pasa 2 veces por semana…</div>
      <div style={{ position: "absolute", left: x0 - 30, width: 4 * BW + 3 * GAP + 60, top: cero, height: 4, background: GRIS }} />
      <div style={{ position: "absolute", left: x0 - 30, top: cero - 40, fontFamily: mono, fontWeight: 700, fontSize: 22, color: GRIS }}>$ 0</div>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        <polyline
          points={[0, 1, 2, 3, 4].map((k) => `${x0 + (k === 0 ? 0 : (k - 1) * (BW + GAP) + BW / 2)},${cero + 4 + (k * 2 * bloque) / 4}`).join(" ")}
          fill="none" stroke={CORAL} strokeWidth={6} strokeDasharray="4 12" strokeLinecap="round"
        />
      </svg>
      {[0, 1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          {[0, 1].map((b) => (
            <div
              key={b}
              style={{
                position: "absolute", left: x0 + s * (BW + GAP), top: cero + 8 + b * (bloque / 2 + 4), width: BW, height: bloque / 2, borderRadius: 12,
                background: `repeating-linear-gradient(135deg, ${CORAL} 0 14px, ${CORAL}bb 14px 28px)`, display: "grid", placeItems: "center", fontFamily: mono, fontWeight: 700, fontSize: 22, color: INK,
              }}
            >
              − 4.040
            </div>
          ))}
          <div style={{ position: "absolute", left: x0 + s * (BW + GAP), top: cero - 50, width: BW, textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 24, color: "#dfe3ea" }}>SEM {s + 1}</div>
        </React.Fragment>
      ))}
      <Golpe top={900} size={150}>− {peso(MES)} al mes</Golpe>
      <div style={{ position: "absolute", top: 1070, left: IN_L, width: IN_W, textAlign: "center", fontFamily: sans, fontWeight: 700, fontSize: 40, color: "#dfe3ea" }}>Sin enterarte.</div>
      <Rotulo op="C" t="EL MES" />
    </>
  );
};
const C2: React.FC = () => (
  <>
    {/* mitad oscura: la servilleta en el volante */}
    <div style={{ position: "absolute", left: 0, top: 0, width: 540, height: 1920, background: NOCHE, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -260, top: 1000, width: 900, height: 900, borderRadius: "50%", border: "60px solid #0b0d12", boxShadow: "inset 0 0 0 30px #1d212b" }} />
      <div style={{ position: "absolute", left: 70, top: 700, width: 380, height: 300, background: "#f7f4ee", rotate: "-6deg", padding: 24, boxShadow: "0 20px 40px rgba(0,0,0,.5)" }}>
        <div style={{ fontFamily: hand, fontWeight: 700, fontSize: 46, color: "#1f2a5c", lineHeight: 1.05 }}>
          38.000
          <br />− gasoil ¿?
          <br />− peaje… <span style={{ textDecoration: "line-through" }}>cubiertas</span>
          <br />= ¿¿??
        </div>
      </div>
      <div style={{ position: "absolute", top: 320, left: 50, width: 450, fontFamily: display, fontSize: 84, lineHeight: 0.95, color: "#f2f3f6" }}>
        Esta cuenta nadie la hace <span style={{ color: AMBER }}>en la banquina.</span>
      </div>
    </div>
    {/* mitad clara: el celular con la cuenta hecha */}
    <div style={{ position: "absolute", left: 540, top: 0, width: 540, height: 1920, background: "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #eef0f4 62%, #e2e5ec 100%)", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 110, top: 640, width: 320, height: 560, borderRadius: 44, background: INK, padding: 18, boxShadow: "0 30px 60px rgba(10,12,18,.3)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 30, background: "#1d212b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <div style={{ width: 170, height: 170, borderRadius: "50%", border: `30px solid ${AMBER}`, borderRightColor: "#565e70", boxShadow: "0 0 30px rgba(245,166,35,.4)" }} />
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: GRIS }}>te quedan</div>
          <div style={{ fontFamily: display, fontSize: 64, lineHeight: 1, color: AMBER }}>$ 47.105</div>
          <Icono n="check" s={34} c={CELESTE} w={3} />
        </div>
      </div>
      <div style={{ position: "absolute", top: 320, left: 40, width: 460, fontFamily: display, fontSize: 84, lineHeight: 0.95, color: INK, textAlign: "right" }}>
        Por eso la hace <span style={{ color: AMBER }}>la app.</span>
      </div>
    </div>
    <div style={{ position: "absolute", left: 536, top: 0, width: 8, height: 1920, background: AMBER, boxShadow: "0 0 30px rgba(245,166,35,.6)" }} />
    <Rotulo op="C" t="EL PUENTE" />
  </>
);

const PIEZAS = { A1, A2, B1, B2, C1, C2 };
export const OpcionesRemate: React.FC<{ id: keyof typeof PIEZAS; guia?: boolean }> = ({ id, guia = false }) => {
  const P = PIEZAS[id];
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#070a12" }}>
      <P />
      {guia ? <ReelsGuide /> : null}
    </AbsoluteFill>
  );
};
