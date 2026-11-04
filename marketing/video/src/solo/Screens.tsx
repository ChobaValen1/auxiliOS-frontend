import React from "react";
import { Img, staticFile } from "remotion";
import { Firma } from "./Firma";
import { mono } from "../theme";
import { Bars, Btn, Card, Field, Group, Ico, k, RmFooter, RmSteps, RmTop, Screen, SoloMark, T, TapIn, Top } from "./ui";

export const Pick: React.FC<{ icon?: string; title: string; sub: string; em?: string; emOk?: boolean; emWait?: boolean; big?: boolean; tap?: boolean; on?: boolean; dashed?: boolean }> = ({ icon, title, sub, em, emOk, emWait, big, tap, on, dashed }) => (
  <div
    style={{
      position: "relative", display: "grid", alignContent: big ? "center" : "start", justifyItems: big ? "center" : "start", textAlign: big ? "center" : "left",
      gap: k(big ? 8 : 4), minHeight: k(big ? 150 : 104), padding: big ? `${k(18)}px ${k(12)}px` : k(14), borderRadius: k(16),
      border: `${k(1)}px ${dashed ? "dashed" : "solid"} ${on ? T.accent : T.strong}`, background: on ? T.accentSoft : dashed ? "none" : T.s2,
    }}
  >
    {icon ? (
      <span style={{ color: T.accent, padding: big ? k(10) : 0, borderRadius: "50%", background: big ? T.accentSoft : "none", display: "grid" }}>
        <Ico n={icon} s={big ? 44 : 28} />
      </span>
    ) : null}
    <b style={big ? { fontFamily: "'Bebas Neue'", fontWeight: 400, fontSize: k(28), lineHeight: 1, letterSpacing: k(1.1), textTransform: "uppercase" } : { fontSize: k(16), lineHeight: 1.2 }}>{title}</b>
    <span style={{ fontSize: k(13), color: T.text2, lineHeight: 1.3 }}>{sub}</span>
    {em ? <em style={{ fontStyle: "normal", fontSize: k(12), fontWeight: 700, color: emOk ? T.ok : emWait ? T.accent : T.text3 }}>{em}</em> : null}
    {tap ? <TapIn dx={big ? k(130) : k(48)} dy={big ? k(30) : k(18)} /> : null}
  </div>
);

const Tabbar: React.FC = () => (
  <div style={{ position: "absolute", left: -k(16), right: -k(16), bottom: 0, height: k(66), background: T.s1, borderTop: `${k(1)}px solid ${T.border}`, display: "grid", gridTemplateColumns: "repeat(4,1fr)", paddingTop: k(8) }}>
    {[["dash", "Inicio"], ["file", "Servicios"], ["wallet", "Gastos"], ["dots", "Más"]].map(([i, l]) => (
      <div key={l} style={{ display: "grid", justifyItems: "center", gap: k(3), fontSize: k(11), fontWeight: 700, color: l === "Servicios" ? T.accent : T.text3 }}>
        <Ico n={i} s={22} />
        {l}
      </div>
    ))}
  </div>
);

// A1 · Servicios de hoy
export const A1Servicios: React.FC = () => (
  <Screen>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: k(8) }}>
      <SoloMark />
    </div>
    <Top icon="cal" title="Hoy" />
    <div style={{ display: "flex", gap: k(6) }}>
      {[["Jue", "30"], ["Vie", "31"], ["Sáb", "1"], ["Dom", "2"], ["Lun", "3"], ["Hoy", "4"]].map(([d, n]) => (
        <div key={n} style={{ flex: 1, borderRadius: k(12), padding: `${k(6)}px 0`, textAlign: "center", background: d === "Hoy" ? T.accent : T.s2, color: d === "Hoy" ? T.accentFg : T.text2, border: `${k(1)}px solid ${d === "Hoy" ? T.accent : T.border}` }}>
          <div style={{ fontSize: k(11), fontWeight: 700 }}>{d}</div>
          <div style={{ fontFamily: mono, fontSize: k(16), fontWeight: 700 }}>{n}</div>
        </div>
      ))}
    </div>
    <div style={{ fontSize: k(13), color: T.text3 }}>2 servicios · $ 96.000</div>
    {[
      ["16:20", "Auxilio mecánico", "$ 38.000", "N.º 0480 · Particular · AC 456 DE", "Cobrado", T.ok],
      ["19:05", "Remolque · 12 km", "$ 58.000", "N.º 0481 · Asist. Sur · AE 902 KJ", "Por cobrar", T.accent],
    ].map(([h, t, m, sub, pill, col]) => (
      <div key={h} style={{ display: "flex", gap: k(12), background: T.s2, border: `${k(1)}px solid ${T.border}`, borderRadius: k(14), padding: k(12) }}>
        <span style={{ fontFamily: mono, fontWeight: 700, fontSize: k(14), color: T.text2 }}>{h}</span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: k(4) }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: k(15) }}>
            <span>{t}</span>
            <span style={{ fontFamily: mono }}>{m}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: k(12), color: T.text3 }}>
            <span>{sub}</span>
            <span style={{ color: col, fontWeight: 700, whiteSpace: "nowrap", background: `${col}22`, padding: `${k(2)}px ${k(8)}px`, borderRadius: 99 }}>{pill}</span>
          </div>
        </div>
      </div>
    ))}
    <div style={{ flex: 1 }} />
    <div style={{ position: "relative", marginBottom: k(84) }}>
      <Btn pri>
        <Ico n="plus" s={18} w={3} /> Nuevo servicio
      </Btn>
      <TapIn dx={k(125)} />
    </div>
    <Tabbar />
  </Screen>
);

// A2 · ¿Para quién es?
export const A2ParaQuien: React.FC<{ pick?: "particular" | "prestadora"; time?: string }> = ({ pick = "particular", time }) => (
  <Screen time={time}>
    <Top title="¿Para quién es?" hint="Paso 1 de 3" />
    <Bars n={1} of={3} />
    <div style={{ display: "flex", flexDirection: "column", gap: k(10), marginTop: k(6) }}>
      <Pick big icon="building" title="Prestadora" sub="Te lo pasó una empresa. Se cobra con tu tarifa." em="3 cargadas" tap={pick === "prestadora"} on={pick === "prestadora"} />
      <Pick big icon="user" title="Particular" sub="Un cliente que te paga en el momento." em="Precio que acordás" tap={pick === "particular"} on={pick === "particular"} />
    </div>
  </Screen>
);

// A3 · ¿Qué servicio?
export const A3QueServicio: React.FC = () => (
  <Screen>
    <Top title="¿Qué servicio?" hint="Paso 2 de 3 · Particular" />
    <Bars n={2} of={3} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: k(10), marginTop: k(6) }}>
      <Pick title="Remolque" sub="Precio a acordar" tap on />
      <Pick title="Auxilio mecánico" sub="Precio a acordar" />
      <Pick title="Traslado" sub="Precio a acordar" />
      <Pick title="Paso de corriente" sub="Precio a acordar" />
    </div>
  </Screen>
);

const Keypad: React.FC = () => (
  <div style={{ position: "absolute", left: -k(16), right: -k(16), bottom: 0, background: "#1c1f26", padding: `${k(8)}px ${k(6)}px ${k(26)}px`, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: k(6) }}>
    {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((d) => (
      <div key={d} style={{ height: k(46), borderRadius: k(8), background: d === "," || d === "⌫" ? "transparent" : "#3a3f4b", display: "grid", placeItems: "center", fontSize: k(24), fontWeight: 500 }}>{d}</div>
    ))}
  </div>
);

// A4 · Precio acordado
export const A4Precio: React.FC<{ price?: string }> = ({ price = "60.000" }) => (
  <Screen>
    <Top title="Precio acordado" hint="Paso 3 de 3 · Particular" />
    <Bars n={3} of={3} />
    <Card>
      <p style={{ margin: 0, fontSize: k(13), color: T.text2, lineHeight: 1.4 }}>Remolque para un particular. Poné lo que acordaste cobrarle; los adicionales los sumás en el remito.</p>
      <Field label="Precio acordado" pre="$" value={price} ph="0" focus />
      <div style={{ position: "relative" }}>
        <Btn pri>Empezar remito</Btn>
        <TapIn dx={k(125)} />
      </div>
    </Card>
    <Keypad />
  </Screen>
);

// A5 · Remito nuevo, paso 1
export const A5Remito: React.FC<{ v?: Partial<Record<"plate" | "mm" | "desde" | "hasta", string>>; focus?: string; toast?: number }> = ({ v = {}, focus, toast = 1 }) => (
  <Screen>
    <RmTop title="Remito nuevo" hint="Particular · Remolque" />
    <RmSteps cur={1} />
    <Card>
      <Group icon="cal" label="Servicio">
        <Field label="Hora" small="Hoy · el día sale del filtro" value="17:45" />
      </Group>
      <Group icon="car" label="Vehículo">
        <Field label="Patente" value={v.plate ?? "AB 123 CD"} ph="AB 123 CD" focus={focus === "plate"} />
        <Field label="Marca y modelo" value={v.mm ?? "Chevrolet Vectra"} ph="Ford Focus" focus={focus === "mm"} />
      </Group>
      <Group icon="route" label="Recorrido">
        <Field label="Desde" value={v.desde ?? "Luis Guillón"} ph="Ciudad / dirección" focus={focus === "desde"} />
        <Field label="Hasta" value={v.hasta ?? "Lomas de Zamora"} ph="Ciudad / dirección" focus={focus === "hasta"} />
        <Field label="Km recorridos" ph="0" post="km" />
      </Group>
    </Card>
    <div style={{ position: "absolute", left: 0, right: 0, top: k(6), display: "flex", justifyContent: "center", zIndex: 40, opacity: toast, translate: `0px ${(1 - toast) * -40}px` }}>
      <div style={{ background: T.ok, color: "#06180f", fontWeight: 700, fontSize: k(14), padding: `${k(10)}px ${k(18)}px`, borderRadius: 99, display: "flex", gap: k(6), alignItems: "center" }}>
        <Ico n="check" s={16} w={3} /> Servicio cargado
      </div>
    </div>
    <div style={{ position: "absolute", left: k(130), bottom: k(30), width: 0, height: 0 }}>
      <TapIn />
    </div>
    <RmFooter first />
  </Screen>
);

// B1 · Socio
export const B1Socio: React.FC<{ phone?: string }> = ({ phone = "11 5555 0182" }) => (
  <Screen time="18:24">
    <RmTop title="Remito nuevo" hint="Particular · Remolque" />
    <RmSteps cur={2} />
    <Card>
      <Group icon="user" label="Quién recibe el servicio">
        <Field label="Nombre y apellido" value="Martín Gómez" />
        <Field label="DNI / CUIT" value="31.204.556" />
      </Group>
      <Group icon="phone" label="Contacto" small="teléfono y/o email">
        <Field label="Teléfono" small="sin 0 ni 15" value={phone} ph="11 2345 6789" focus />
        <Field label="Email" ph="Para mandarle el remito" />
      </Group>
    </Card>
    <div style={{ position: "absolute", right: k(26), bottom: k(36), width: 0, height: 0 }}>
      <TapIn />
    </div>
    <RmFooter />
  </Screen>
);

// B2 · Adicionales y cobro
export const B2Adicionales: React.FC<{ sel?: string }> = ({ sel = "Transferencia" }) => (
  <Screen time="18:25">
    <RmTop title="Remito nuevo" hint="Particular · Remolque" />
    <RmSteps cur={3} />
    <Card>
      <Group icon="plus" label="Adicionales" small="se suman al precio">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: k(8) }}>
          {[["route", "Peajes"], ["gauge", "Excedente km"], ["clock", "Espera / maniobras"], ["dots", "Otros"]].map(([i, l]) => (
            <div key={l} style={{ background: T.s1, border: `${k(1)}px solid ${T.strong}`, borderRadius: k(12), padding: k(10), display: "flex", flexDirection: "column", gap: k(6) }}>
              <span style={{ display: "flex", gap: k(6), alignItems: "center", fontSize: k(12), fontWeight: 700, color: T.text2 }}>
                <Ico n={i} s={14} /> {l}
              </span>
              <span style={{ fontSize: k(15), color: T.text3 }}>$ 0</span>
            </div>
          ))}
        </div>
      </Group>
      <div style={{ background: T.accentSoft, border: `${k(1)}px solid ${T.accent}`, borderRadius: k(14), padding: k(14), display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: k(15) }}>Total a cobrar</span>
        <b style={{ fontFamily: mono, fontSize: k(24), color: T.accent }}>$ 60.000</b>
      </div>
      <Group icon="wallet" label="Cobro">
        <div style={{ display: "flex", flexWrap: "wrap", gap: k(8) }}>
          {[["cash", "Efectivo"], ["bank", "Transferencia"], ["card", "Tarjeta"], ["wallet", "Mercado Pago"], ["dots", "Otro"], ["plus", "Dos medios"]].map(([i, l]) => (
            <div key={l} style={{ position: "relative", display: "flex", alignItems: "center", gap: k(6), padding: `${k(10)}px ${k(12)}px`, borderRadius: 99, fontSize: k(13), fontWeight: 700, background: l === sel ? T.accent : T.s1, color: l === sel ? T.accentFg : T.text2, border: `${k(1)}px ${l === "Dos medios" ? "dashed" : "solid"} ${l === sel ? T.accent : T.strong}` }}>
              <Ico n={i} s={16} /> {l}
              {l === "Transferencia" ? <TapIn dx={k(52)} dy={k(10)} /> : null}
            </div>
          ))}
        </div>
      </Group>
    </Card>
    <RmFooter />
  </Screen>
);

// B3 · Evidencia
export const B3Evidencia: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <Screen time="18:27">
    <RmTop title="Remito nuevo" hint="Particular · Remolque" />
    <RmSteps cur={4} />
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: k(6), fontSize: k(11), fontWeight: 700, letterSpacing: k(0.6), textTransform: "uppercase", color: T.text3 }}>
          <Ico n="camera" s={14} c={T.accent} /> Fotos del vehículo <small style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>antes de cargarlo</small>
        </span>
        <span style={{ display: "flex", gap: k(5), alignItems: "center", fontSize: k(12), fontWeight: 700, color: T.text2 }}>
          <Ico n="upload" s={14} /> Subir varias
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: k(8) }}>
        {([["Frente del vehículo", "frente"], ["Lateral", "lateral"], ["Daños o estado adicional", ""], ["Odómetro", "odometro"], ["Foto extra 1", "trasera"], ["Foto extra 2", ""]] as const).map(([l, foto], i) => {
          const rank = ["frente", "lateral", "odometro", "trasera"].indexOf(foto);
          const has = !!foto && rank < count;
          return (
          <div key={l as string} style={{ position: "relative", aspectRatio: "1", borderRadius: k(12), border: `${k(1.5)}px ${has ? "solid" : "dashed"} ${has ? T.ok : T.strong}`, background: has ? "linear-gradient(160deg,#4a5368,#262b38)" : T.s1, display: "grid", alignContent: "end", overflow: "hidden" }}>
            {has ? (
              <>
                <Img src={staticFile(`fotos/${foto}.jpg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", top: k(6), right: k(6), width: k(20), height: k(20), borderRadius: "50%", background: T.ok, color: "#06180f", display: "grid", placeItems: "center" }}>
                  <Ico n="check" s={12} w={3.5} />
                </span>
              </>
            ) : (
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: T.text3 }}>
                <Ico n="camera" s={22} />
              </span>
            )}
            <span style={{ position: "relative", padding: k(6), fontSize: k(11), lineHeight: 1.2, fontWeight: 700, color: has ? "#fff" : T.text2, background: has ? "linear-gradient(transparent,rgba(0,0,0,.6))" : "none" }}>{l}</span>
            {i === 3 ? <TapIn dx={k(28)} dy={-k(22)} /> : null}
          </div>
          );
        })}
      </div>
      <Field label="Observaciones" value="Raspón previo en el paragolpes delantero" />
    </Card>
    <RmFooter />
  </Screen>
);

// B4 · Firma
export const B4Firma: React.FC<{ ms?: number }> = ({ ms }) => (
  <Screen time="18:31">
    <RmTop title="Remito nuevo" hint="Particular · Remolque" />
    <RmSteps cur={5} />
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: k(8) }}>
        {[["Servicio conforme", "Se prestó bien", ""], ["Acepta los cargos", "Peajes y adicionales", ""], ["Sin daños", "Entregado como estaba", ""], ["Arrastre", "Autoriza el arrastre", " · opcional"]].map(([b, s, opt]) => (
          <div key={b} style={{ display: "flex", gap: k(8), alignItems: "flex-start", background: T.okSoft, border: `${k(1)}px solid ${T.ok}`, borderRadius: k(12), padding: k(10) }}>
            <span style={{ width: k(20), height: k(20), borderRadius: k(6), background: T.ok, color: "#06180f", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Ico n="check" s={13} w={3.5} />
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <b style={{ fontSize: k(13) }}>
                {b}
                {opt ? <em style={{ fontStyle: "normal", color: T.text3, fontWeight: 500 }}>{opt}</em> : null}
              </b>
              <small style={{ fontSize: k(11), color: T.text3 }}>{s}</small>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: k(8), fontSize: k(13), fontWeight: 700 }}>
        <i style={{ width: k(10), height: k(10), borderRadius: "50%", background: ms === undefined || ms > 0 ? T.ok : T.strong }} />
        <span style={{ flex: 1 }}>Firma del socio</span>
        <span style={{ display: "flex", gap: k(6), alignItems: "center", color: T.text3, fontWeight: 500 }}>
          <span style={{ width: k(16), height: k(16), borderRadius: k(4), border: `${k(1)}px solid ${T.strong}` }} /> Socio ausente
        </span>
        <Ico n="trash" s={16} c={T.text3} />
      </div>
      <div style={{ position: "relative", height: k(150), borderRadius: k(12), background: "#f3f4f7" }}>
        <div style={{ position: "absolute", inset: k(10) }}>
          <Firma ms={ms} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: k(8) }}>
        <Field label="Aclaración" value="Martín Gómez" />
        <Field label="DNI" value="31.204.556" />
      </div>
    </Card>
    <div style={{ position: "absolute", right: k(26), bottom: k(36), width: 0, height: 0 }}>
      <TapIn />
    </div>
    <RmFooter last />
  </Screen>
);

// B5 · Enviar remito
export const B5Enviar: React.FC<{ sheet?: number }> = ({ sheet = 1 }) => (
  <Screen time="18:32">
    <div style={{ opacity: 0.35, display: "flex", flexDirection: "column", gap: k(12) }}>
      <Top icon="back" title="Remito N.º 0482" hint="Particular · Remolque" right={<span style={{ fontSize: k(12), fontWeight: 700, color: T.ok, background: T.okSoft, padding: `${k(4)}px ${k(10)}px`, borderRadius: 99 }}>Firmado</span>} />
      <Card style={{ height: k(300) }}>{null}</Card>
    </div>
    <div style={{ position: "absolute", left: -k(16), right: -k(16), bottom: 0, translate: `0px ${(1 - sheet) * 100}%`, background: T.s2, borderRadius: `${k(22)}px ${k(22)}px 0 0`, borderTop: `${k(1)}px solid ${T.strong}`, padding: `${k(10)}px ${k(16)}px ${k(34)}px`, display: "flex", flexDirection: "column", gap: k(10) }}>
      <i style={{ alignSelf: "center", width: k(40), height: k(4), borderRadius: 99, background: T.strong }} />
      <div style={{ fontSize: k(18), fontWeight: 700, padding: `${k(4)}px 0` }}>Enviar remito N.º 0482</div>
      {[["msg", "WhatsApp a Martín", "11 5555 0182", true], ["share", "Compartir el PDF", "Elegís la app y el contacto", false]].map(([i, b, s, tap]) => (
        <div key={b as string} style={{ position: "relative", display: "flex", gap: k(12), alignItems: "center", background: T.s1, border: `${k(1)}px solid ${tap ? T.accent : T.strong}`, borderRadius: k(14), padding: k(14) }}>
          <span style={{ color: T.accent }}>
            <Ico n={i as string} s={24} />
          </span>
          <span style={{ display: "flex", flexDirection: "column" }}>
            <b style={{ fontSize: k(15) }}>{b}</b>
            <small style={{ fontSize: k(12), color: T.text3 }}>{s}</small>
          </span>
          {tap ? <TapIn dx={k(130)} dy={-k(6)} /> : null}
        </div>
      ))}
      <p style={{ margin: 0, fontSize: k(12), color: T.text3 }}>Le llega un link para descargar el PDF y verificar que es original.</p>
    </div>
  </Screen>
);
