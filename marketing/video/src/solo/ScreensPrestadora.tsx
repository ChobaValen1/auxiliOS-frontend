import React from "react";
import { Pick } from "./Screens";
import { Bars, Ico, k, Screen, T, Top } from "./ui";

// Pantallas del alta de un servicio de prestadora (solo-ops.js: stepClient y stepType)

export const P2QuePrestadora: React.FC<{ on?: boolean }> = ({ on = true }) => (
  <Screen time="15:12">
    <Top title="¿Qué prestadora?" hint="Paso 2 de 3" />
    <Bars n={2} of={3} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: k(10), marginTop: k(6) }}>
      <Pick title="Asistencia del Sur" sub="Paga a 30 días" em="2 tarifas" emOk tap on={on} />
      <Pick title="Auxilio Integral" sub="Paga a 45 días" em="3 tarifas" emOk />
      <Pick title="Rutas Asistencia" sub="Paga a 60 días" em="Sin tarifas" emWait />
      <div style={{ position: "relative", display: "grid", alignContent: "start", gap: k(4), minHeight: k(104), padding: k(14), borderRadius: k(16), border: `${k(1)}px dashed ${T.strong}` }}>
        <span style={{ color: T.accent, display: "grid" }}>
          <Ico n="plus" s={28} />
        </span>
        <b style={{ fontSize: k(16), lineHeight: 1.2 }}>Nueva prestadora</b>
        <span style={{ fontSize: k(13), color: T.text2 }}>Cargala con sus tarifas</span>
      </div>
    </div>
  </Screen>
);

export const P3QueServicio: React.FC<{ on?: boolean }> = ({ on = true }) => (
  <Screen time="15:12">
    <Top title="¿Qué servicio?" hint="Paso 3 de 3 · Asistencia del Sur" />
    <Bars n={3} of={3} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: k(10), marginTop: k(6) }}>
      <Pick title="Remolque" sub="Base $ 45.000" em="20 km incluidos" emOk tap on={on} />
      <Pick title="Auxilio mecánico" sub="Base $ 28.000" em="10 km incluidos" emOk />
      <Pick title="Traslado" sub="Base $ 52.000" em="30 km incluidos" emOk />
      <Pick title="Paso de corriente" sub="" em="Sin tarifa" emWait />
    </div>
  </Screen>
);

// Confirmación al finalizar el remito
export const RemitoFirmado: React.FC<{ pop?: number }> = ({ pop = 1 }) => (
  <Screen time="16:02">
    <Top title="Remito N.º 0482" hint="Asistencia del Sur · Remolque" />
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: k(14), marginTop: k(40) }}>
      <div style={{ width: k(120), height: k(120), borderRadius: "50%", background: T.ok, color: "#06180f", display: "grid", placeItems: "center", scale: 0.5 + pop * 0.5 }}>
        <Ico n="check" s={64} w={3.2} />
      </div>
      <div style={{ fontSize: k(26), fontWeight: 700, opacity: pop }}>Remito firmado</div>
      <div style={{ fontSize: k(14), color: T.text2, textAlign: "center", opacity: pop }}>Con 4 fotos, la firma del socio y su código de verificación.</div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: k(10), marginTop: k(26), opacity: pop }}>
      <div style={{ minHeight: k(48), borderRadius: k(12), background: T.accent, color: T.accentFg, display: "flex", alignItems: "center", justifyContent: "center", gap: k(8), fontWeight: 700, fontSize: k(15) }}>
        <Ico n="msg" s={18} /> Enviar remito
      </div>
      <div style={{ minHeight: k(48), borderRadius: k(12), border: `${k(1)}px solid ${T.strong}`, background: T.s2, display: "flex", alignItems: "center", justifyContent: "center", gap: k(8), fontWeight: 700, fontSize: k(15) }}>
        <Ico n="file" s={18} /> Ver PDF
      </div>
    </div>
  </Screen>
);

// Facturación › Asistencia del Sur (solo-facturacion.js: detail)
const REMITOS = [
  ["N.º 0478 · Remolque", "$ 52.500", "02/11 · AE 902 KJ · 25 km"],
  ["N.º 0480 · Remolque", "$ 45.000", "03/11 · AC 456 DE · 18 km"],
  ["N.º 0481 · Remolque", "$ 60.000", "03/11 · AA 771 BC · 30 km"],
  ["N.º 0482 · Remolque", "$ 63.000", "04/11 · AB 123 CD · 32 km"],
];
export const FACTURA_TOTAL = "$ 220.500";

const Mini: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = T.text }) => (
  <div style={{ flex: 1, background: T.s2, border: `${k(1)}px solid ${T.border}`, borderRadius: k(12), padding: k(10) }}>
    <div style={{ fontSize: k(11), color: T.text3, fontWeight: 700 }}>{label}</div>
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: k(14), color, marginTop: k(2) }}>{value}</div>
  </div>
);

export const FacturacionPrestadora: React.FC<{ estado: "porCobrar" | "confirmar" | "cobrado" }> = ({ estado }) => {
  const cobrado = estado === "cobrado";
  return (
    <Screen time="10:12">
      <Top title="Asistencia del Sur" hint="Noviembre · paga a 30 días" />
      <div style={{ display: "flex", gap: k(8) }}>
        <Mini label="A facturar" value={FACTURA_TOTAL} />
        <Mini label="Cobrado" value={cobrado ? FACTURA_TOTAL : "$ 0"} color={T.ok} />
        <Mini label="Por cobrar" value={cobrado ? "$ 0" : FACTURA_TOTAL} color={T.accent} />
      </div>
      <div style={{ display: "flex", gap: k(10), padding: k(12), borderRadius: k(12), background: cobrado ? T.okSoft : "rgba(240,113,107,.14)", color: cobrado ? T.ok : "#f0716b", fontSize: k(14), fontWeight: 700 }}>
        <Ico n={cobrado ? "check" : "clock"} s={18} />
        <span>{cobrado ? "Todo cobrado" : "Facturado el 04/11 · vence hoy, 04/12"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: k(8) }}>
        {REMITOS.map(([a, m, b]) => (
          <div key={a} style={{ background: T.s2, border: `${k(1)}px solid ${T.border}`, borderRadius: k(14), padding: k(12), display: "flex", flexDirection: "column", gap: k(4) }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: k(15) }}>
              <span>{a}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: k(12), color: T.text3 }}>
              <span>{b}</span>
              <span style={{ fontWeight: 700, padding: `${k(2)}px ${k(8)}px`, borderRadius: 99, background: cobrado ? T.okSoft : T.accentSoft, color: cobrado ? T.ok : T.accent }}>{cobrado ? "Cobrado" : "Por cobrar"}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: k(22), display: "flex", gap: k(8) }}>
        <div style={{ flex: 1, minHeight: k(48), borderRadius: k(12), border: `${k(1)}px solid ${T.strong}`, background: T.s2, display: "flex", alignItems: "center", justifyContent: "center", gap: k(6), fontWeight: 700, fontSize: k(14) }}>
          <Ico n="share" s={16} /> Resumen PDF
        </div>
        {cobrado ? (
          <div style={{ flex: 1.4, minHeight: k(48), borderRadius: k(12), background: T.okSoft, color: T.ok, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: k(14) }}>Todo cobrado</div>
        ) : (
          <div style={{ flex: 1.4, minHeight: k(48), borderRadius: k(12), background: T.accent, color: T.accentFg, display: "flex", alignItems: "center", justifyContent: "center", gap: k(6), fontWeight: 700, fontSize: k(estado === "confirmar" ? 13 : 15) }}>
            {estado === "confirmar" ? `Confirmar 4 remitos · ${FACTURA_TOTAL}` : <><Ico n="cash" s={18} /> Marcar cobrado</>}
          </div>
        )}
      </div>
    </Screen>
  );
};

// Mis números (solo-numeros.js): lo que deja cada servicio y el punto de equilibrio
export const MisNumeros: React.FC<{ queda?: number }> = ({ queda = 722000 }) => (
  <Screen time="10:13">
    <Top title="Mis números" hint="Noviembre" />
    <div style={{ display: "flex", gap: k(8) }}>
      <Mini label="Por servicio" value="$ 40.111" color={T.ok} />
      <Mini label="Por km" value="$ 1.337" />
      <Mini label="Servicios" value="18" />
    </div>
    <div style={{ background: T.s2, border: `${k(1)}px solid ${T.border}`, borderRadius: k(14), padding: k(14), display: "flex", flexDirection: "column", gap: k(8) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: k(15) }}>Punto de equilibrio</b>
        <span style={{ fontSize: k(12), fontWeight: 700, padding: `${k(2)}px ${k(8)}px`, borderRadius: 99, background: T.okSoft, color: T.ok }}>Cubierto</span>
      </div>
      <div style={{ fontSize: k(14), color: T.text2, lineHeight: 1.35 }}>Necesitás 4 servicios por mes para cubrir $ 180.000 de fijos. Llevás 18.</div>
      <div style={{ height: k(8), borderRadius: 99, background: T.ok }} />
    </div>
    <div style={{ background: T.s2, border: `${k(1)}px solid ${T.accent}`, borderRadius: k(14), padding: k(14), display: "flex", flexDirection: "column", gap: k(6) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontSize: k(15) }}>Nov 2026</b>
        <b style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: k(20), color: T.ok }}>{"$ " + Math.round(queda).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</b>
      </div>
      <div style={{ fontSize: k(12), color: T.text3 }}>Facturé $ 1.134.000 · gasté $ 412.000 · 18 serv.</div>
    </div>
  </Screen>
);
