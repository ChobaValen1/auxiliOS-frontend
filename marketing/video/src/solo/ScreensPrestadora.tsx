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
