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
