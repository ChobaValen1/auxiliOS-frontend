import React from "react";
import { AbsoluteFill } from "remotion";
import { display, mono, sans } from "../theme";
import { SAFE } from "../gastos/common";
import { ReelsGuide } from "../monogrua/StepFrame";
import { AMBER, FIJOS_MES, Icono, KM, PASOS, peso, SERVICIOS, W } from "./Fase1";
import { CELESTE, CORAL } from "./MapaFijo";

// Tres propuestas de gráfico para el paso 2 de la fase 3 («Mirás tus números»).
// Mismos números del mes que usa la fase 3: 110 servicios de $ 70.000.
const IN_L = SAFE.left + 20;
const IN_W = W - 40;
const INK = "#14161b";
const GRIS = "#9aa3b8";
const N = 110;
const PRECIO = 70000;
const VAR_SERV = PASOS.filter((p) => !p.fijo).reduce((s, p) => s + p.monto, 0) / SERVICIOS; // 17.240
const FIJO_SERV = Math.round(FIJOS_MES / N); // 5.655
const QUEDA_SERV = PRECIO - VAR_SERV - FIJO_SERV; // 47.105
const DEJA = PRECIO - VAR_SERV; // 52.760 antes de los fijos
const FACTURADO = N * PRECIO;
const VARIABLES = N * VAR_SERV;
const QUEDA = FACTURADO - VARIABLES - FIJOS_MES; // 5.181.600
const NECESITAS = Math.ceil(FIJOS_MES / DEJA); // 12
const POR_KM = Math.round(QUEDA / (N * (KM / SERVICIOS))); // 1.308
const mill = (n: number) => `$ ${(n / 1e6).toFixed(1).replace(".", ",")} M`;

const Fondo: React.FC = () => <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 38%, #ffffff 0%, #eef0f4 62%, #e2e5ec 100%)" }} />;
const Encabezado: React.FC<{ op: string }> = ({ op }) => (
  <div style={{ position: "absolute", top: 296, left: IN_L, width: IN_W }}>
    <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 3, color: "#6b7285" }}>PASO 2 · OPCIÓN {op}</div>
    <div style={{ fontFamily: display, fontSize: 112, lineHeight: 1, color: INK, marginTop: 4 }}>Mirás tus números</div>
  </div>
);
const Tarjeta: React.FC<{ top: number; children: React.ReactNode; h?: number }> = ({ top, children, h }) => (
  <div style={{ position: "absolute", top, left: IN_L, width: IN_W, height: h, borderRadius: 36, background: INK, padding: "28px 30px", boxShadow: "0 30px 60px rgba(10,12,18,.28)" }}>{children}</div>
);
const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: GRIS }}>{children}</div>;

// ── A · La torta de un servicio ─────────────────────────────────────
const OpcionA: React.FC = () => {
  const partes: [string, number, string, string][] = [
    ["Te queda", QUEDA_SERV, AMBER, "check"],
    ["Gastos del día", VAR_SERV, CELESTE, "gasoil"],
    ["Fijos del mes", FIJO_SERV, CORAL, "cal"],
  ];
  const R = 210, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <>
      <Encabezado op="A" />
      <Tarjeta top={470} h={760}>
        <Rotulo>UN SERVICIO DE {peso(PRECIO)}, POR DENTRO</Rotulo>
        <div style={{ position: "relative", width: 520, height: 520, margin: "18px auto 0" }}>
          <svg width={520} height={520} viewBox="0 0 520 520" style={{ rotate: "-90deg" }}>
            {partes.map(([n, v, c]) => {
              const len = (v / PRECIO) * C;
              const el = <circle key={n} cx={260} cy={260} r={R} fill="none" stroke={c} strokeWidth={84} strokeDasharray={`${len - 6} ${C - len + 6}`} strokeDashoffset={-acc} />;
              acc += len;
              return el;
            })}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 30, color: GRIS }}>te quedan</div>
            <div style={{ fontFamily: display, fontSize: 112, lineHeight: 1, color: AMBER }}>{peso(QUEDA_SERV)}</div>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: GRIS }}>{Math.round((QUEDA_SERV / PRECIO) * 100)} % de lo que cobrás</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 26 }}>
          {partes.map(([n, v, c, ico]) => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 250 }}>
              <span style={{ width: 54, height: 54, borderRadius: 16, background: c, color: INK, display: "grid", placeItems: "center" }}>
                <Icono n={ico} s={28} w={2.4} />
              </span>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 26, color: "#dfe3ea" }}>{n}</span>
              <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, color: c }}>{peso(v)}</span>
            </div>
          ))}
        </div>
      </Tarjeta>
    </>
  );
};

// ── B · La curva del mes: arrancás debiendo los fijos ───────────────
const OpcionB: React.FC = () => {
  const GW = 760, GH = 470, PL = 20, PB = 40;
  const NV = 30; // se ven los primeros 30 servicios del mes
  const minY = -FIJOS_MES, maxY = NV * DEJA - FIJOS_MES;
  const x = (n: number) => PL + (n / NV) * (GW - PL - 10);
  const y = (v: number) => 20 + (1 - (v - minY) / (maxY - minY)) * (GH - PB - 20);
  const val = (n: number) => n * DEJA - FIJOS_MES;
  const cero = y(0);
  const pts = Array.from({ length: NV + 1 }).map((_, n) => `${x(n)},${y(val(n))}`).join(" ");
  const xe = x(FIJOS_MES / DEJA);
  return (
    <>
      <Encabezado op="B" />
      <Tarjeta top={470} h={760}>
        <Rotulo>LO QUE TE QUEDA EN EL MES, SERVICIO A SERVICIO</Rotulo>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 28, color: "#dfe3ea" }}>Noviembre · {N} servicios</span>
          <span style={{ fontFamily: display, fontSize: 84, lineHeight: 1, color: AMBER }}>{mill(QUEDA)}</span>
        </div>
        <svg width={GW} height={GH} style={{ marginTop: 14, overflow: "visible" }}>
          <defs>
            <clipPath id="arriba"><rect x={0} y={0} width={GW} height={cero} /></clipPath>
            <clipPath id="abajo"><rect x={0} y={cero} width={GW} height={GH} /></clipPath>
          </defs>
          {[0.25, 0.5, 0.75].map((k) => (
            <line key={k} x1={PL} x2={GW} y1={20 + k * (GH - 60)} y2={20 + k * (GH - 60)} stroke="rgba(255,255,255,.06)" strokeWidth={2} />
          ))}
          <polygon points={`${x(0)},${cero} ${pts} ${x(NV)},${cero}`} fill="rgba(245,166,35,.28)" clipPath="url(#arriba)" />
          <polygon points={`${x(0)},${cero} ${pts} ${x(NV)},${cero}`} fill="rgba(255,122,107,.35)" clipPath="url(#abajo)" />
          <polyline points={pts} fill="none" stroke={AMBER} strokeWidth={8} strokeLinejoin="round" clipPath="url(#arriba)" />
          <polyline points={pts} fill="none" stroke={CORAL} strokeWidth={8} strokeLinejoin="round" clipPath="url(#abajo)" />
          <line x1={PL} x2={GW} y1={cero} y2={cero} stroke="#9aa3b8" strokeWidth={3} strokeDasharray="10 8" />
          <circle cx={xe} cy={cero} r={14} fill="#fff" stroke={INK} strokeWidth={5} />
          <polygon points={`${x(NV) - 10},${y(val(NV)) - 22} ${x(NV) + 14},${y(val(NV)) - 8} ${x(NV) - 4},${y(val(NV)) + 12}`} fill={AMBER} />
          <text x={x(0) + 24} y={y(-FIJOS_MES) + 8} fill={CORAL} fontFamily="JetBrains Mono" fontWeight={700} fontSize={24}>arrancás el mes debiendo {peso(FIJOS_MES)}</text>
          <text x={x(NV) - 30} y={y(val(NV)) + 10} fill={AMBER} fontFamily="JetBrains Mono" fontWeight={700} fontSize={24} textAnchor="end">y sigue subiendo…</text>
        </svg>
        <div style={{ position: "absolute", left: 30 + xe - 30, top: 166 + cero + 40, display: "flex", alignItems: "center", gap: 10, background: "#f2f3f6", color: INK, padding: "10px 16px", borderRadius: 14, fontFamily: sans, fontWeight: 700, fontSize: 26 }}>
          Servicio {NECESITAS}: cubriste los fijos
        </div>
        <div style={{ position: "absolute", left: 30, right: 30, bottom: 26, display: "flex", gap: 14 }}>
          {[["Por servicio", peso(QUEDA_SERV), AMBER], ["Por km", peso(POR_KM), CELESTE]].map(([l, v, c]) => (
            <div key={l} style={{ flex: 1, borderRadius: 20, background: "#1d212b", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: GRIS }}>{l}</span>
              <span style={{ fontFamily: display, fontSize: 56, lineHeight: 1, color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </Tarjeta>
    </>
  );
};

// ── C · La cascada: de lo que facturás a lo que te queda ────────────
const OpcionC: React.FC = () => {
  const barras: { t: string; desde: number; hasta: number; c: string; ico: string }[] = [
    { t: "Facturaste", desde: 0, hasta: FACTURADO, c: "#dfe3ea", ico: "recibo" },
    { t: "Gastos del día", desde: FACTURADO - VARIABLES, hasta: FACTURADO, c: CELESTE, ico: "gasoil" },
    { t: "Fijos del mes", desde: QUEDA, hasta: QUEDA + FIJOS_MES, c: CORAL, ico: "cal" },
    { t: "Te queda", desde: 0, hasta: QUEDA, c: AMBER, ico: "check" },
  ];
  const GH = 330, BW = 150, GAP = 40;
  const h = (v: number) => (v / FACTURADO) * GH;
  return (
    <>
      <Encabezado op="C" />
      <Tarjeta top={470} h={760}>
        <Rotulo>DE LO QUE FACTURÁS A LO QUE TE QUEDA · NOVIEMBRE</Rotulo>
        <div style={{ position: "relative", height: GH + 150, marginTop: 10 }}>
          {barras.map((b, i) => {
            const left = 20 + i * (BW + GAP);
            const top = 60 + GH - h(b.hasta);
            const resta = i === 1 || i === 2;
            return (
              <React.Fragment key={b.t}>
                <div style={{ position: "absolute", left, top: top - 50, width: BW, textAlign: "center", fontFamily: display, fontSize: 46, color: b.c }}>
                  {resta ? "− " : ""}
                  {mill(b.hasta - b.desde)}
                </div>
                <div
                  style={{
                    position: "absolute", left, top, width: BW, height: Math.max(8, h(b.hasta - b.desde)), borderRadius: 14,
                    background: resta ? `repeating-linear-gradient(135deg, ${b.c} 0 14px, ${b.c}bb 14px 28px)` : b.c,
                  }}
                />
                {i < barras.length - 1 ? (
                  <div style={{ position: "absolute", left: left + BW, width: GAP, top: 60 + GH - h(i === 0 ? FACTURADO - VARIABLES : i === 1 ? FACTURADO - VARIABLES : QUEDA), borderTop: "3px dashed rgba(255,255,255,.3)" }} />
                ) : null}
                <div style={{ position: "absolute", left, top: 60 + GH + 16, width: BW, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ color: b.c }}>
                    <Icono n={b.ico} s={34} w={2.4} />
                  </span>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: "#dfe3ea", textAlign: "center", lineHeight: 1.1 }}>{b.t}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
          {[["Por servicio", peso(QUEDA_SERV), AMBER], ["Por km", peso(POR_KM), CELESTE], ["Cubrís los fijos en", `${NECESITAS} serv.`, "#f2f3f6"]].map(([l, v, c]) => (
            <div key={l} style={{ flex: 1, borderRadius: 20, background: "#1d212b", padding: "12px 16px" }}>
              <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 20, color: GRIS }}>{l}</div>
              <div style={{ fontFamily: display, fontSize: 50, lineHeight: 1.05, color: c, whiteSpace: "nowrap" }}>{v}</div>
            </div>
          ))}
        </div>
      </Tarjeta>
    </>
  );
};

export const OpcionesNumeros: React.FC<{ op: "A" | "B" | "C"; guia?: boolean }> = ({ op, guia = false }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <Fondo />
    {op === "A" ? <OpcionA /> : op === "B" ? <OpcionB /> : <OpcionC />}
    {guia ? <ReelsGuide /> : null}
  </AbsoluteFill>
);
