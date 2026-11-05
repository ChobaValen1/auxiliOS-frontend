import { Audio } from "@remotion/media";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { clamp, sans } from "../../theme";
import { Firma } from "../../solo/Firma";
import { StepFrame } from "../StepFrame";
import { BigButton, Finger, Header, Ico, Phone, Pill, pop, ramp, U } from "./ui";

export const P2_CON = 250;
const SHOTS = [20, 36, 52, 68];
const FOTOS: [string, string][] = [
  ["frente", "Frente"],
  ["lateral", "Lateral"],
  ["odometro", "Odómetro"],
  ["trasera", "Trasera"],
];
const FIRMA_AT = 128; // escena 2 arranca en 110; la firma tarda 1,14 s
const TAP_FIN = 180;
const BTN = { x: 430, y: 646 }; // centro del botón Finalizar (coordenadas del celular)

const Fotos: React.FC<{ f: number }> = ({ f }) => {
  const n = SHOTS.filter((t) => f >= t).length;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header f={f} title="Fotos del vehículo" sub="Remito N.º 0482 · AB 123 CD" />
      <Pill color={n === 4 ? U.ok : U.accent} style={{ position: "absolute", right: 44, top: 132, fontSize: 30 }}>{n}/4</Pill>
      <div style={{ position: "absolute", left: 44, top: 200, display: "grid", gridTemplateColumns: "370px 370px", gap: 32 }}>
        {FOTOS.map(([file, label], i) => {
          const at = SHOTS[i];
          const has = f >= at;
          const flash = interpolate(f, [at - 1, at + 1, at + 9], [0, 1, 0], clamp);
          return (
            <div key={file} style={{ position: "relative", height: 250, borderRadius: 28, overflow: "hidden", border: `3px ${has ? "solid" : "dashed"} ${has ? U.ok : U.line}`, background: U.card }}>
              {has ? (
                <Img src={staticFile(`fotos/${file}.jpg`)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", scale: 1.18 - ramp(f, at, at + 14) * 0.18 }} />
              ) : (
                <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: U.muted }}>
                  <Ico n="camera" s={18} />
                </span>
              )}
              <span style={{ position: "absolute", left: 18, bottom: 14, fontFamily: sans, fontWeight: 700, fontSize: 30, color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,.8)" }}>{label}</span>
              {has ? (
                <span style={{ position: "absolute", right: 14, top: 14, width: 54, height: 54, borderRadius: "50%", background: U.ok, color: "#06180f", display: "grid", placeItems: "center", scale: pop(f, at + 4, at + 14) }}>
                  <Ico n="check" s={12} w={3.5} />
                </span>
              ) : null}
              <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FirmaYFin: React.FC<{ f: number }> = ({ f }) => {
  // f es el cuadro de la escena completa
  const local = f - 110;
  const reveal = ramp(f, TAP_FIN + 6, TAP_FIN + 22);
  const ok = pop(f, TAP_FIN + 18, TAP_FIN + 32);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Header f={local} title="Firma del socio" sub="Martín Gómez · DNI 31.204.556" />
      <div style={{ position: "absolute", left: 44, right: 44, top: 196, display: "flex", gap: 14 }}>
        {["Servicio conforme", "Sin daños"].map((t, i) => (
          <Pill key={t} color={U.ok} style={{ fontSize: 28, padding: "10px 20px", opacity: pop(local, 6 + i * 6, 14 + i * 6) }}>✓ {t}</Pill>
        ))}
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 262, height: 300, borderRadius: 28, background: "#f3f4f7", padding: 26 }}>
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 56, borderTop: "3px dashed #c6cad6" }} />
        <Firma ms={Math.max(0, ((f - FIRMA_AT) / 30) * 1000)} stroke={12} />
      </div>
      <div style={{ position: "absolute", left: 44, right: 44, top: 590 }}>
        <BigButton f={f} tap={TAP_FIN}>
          <Ico n="check" s={16} w={3} /> Finalizar
        </BigButton>
      </div>
      {/* confirmación: círculo verde que sale del botón y llena la pantalla */}
      <div style={{ position: "absolute", left: BTN.x - 1400, top: BTN.y - 1400, width: 2800, height: 2800, borderRadius: "50%", background: U.ok, scale: reveal, opacity: reveal > 0 ? 1 : 0 }} />
      {reveal > 0.6 ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 170, gap: 22, color: "#06180f" }}>
          <div style={{ width: 210, height: 210, borderRadius: "50%", background: "#fff", color: U.ok, display: "grid", placeItems: "center", scale: ok }}>
            <Ico n="check" s={40} w={3.2} />
          </div>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 66, opacity: ok }}>Remito firmado</div>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 34, opacity: ok, textAlign: "center", padding: "0 60px" }}>Con 4 fotos, la firma del socio y su código para verificarlo</div>
        </div>
      ) : null}
    </div>
  );
};

export const Paso2Con: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <StepFrame n={2} mode="con" title="El remito">
      <Phone time="15:58">
        {f < 110 ? (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - ramp(f, 100, 110), scale: 1 - ramp(f, 100, 110) * 0.06 }}>
            <Fotos f={f} />
          </div>
        ) : null}
        {f >= 100 ? (
          <div style={{ position: "absolute", inset: 0, opacity: ramp(f, 100, 110), scale: 1.06 - ramp(f, 100, 110) * 0.06 }}>
            <FirmaYFin f={f} />
          </div>
        ) : null}
        <Finger f={f} at={TAP_FIN} x={BTN.x} y={BTN.y} />
      </Phone>
      {SHOTS.map((t) => (
        <Audio key={t} name="Foto" src={staticFile("sfx/shutter.wav")} from={t} volume={0.4} />
      ))}
      <Audio name="Toque" src={staticFile("sfx/mouse-click.wav")} from={TAP_FIN} volume={0.45} />
      <Audio name="Firmado" src={staticFile("sfx/ding.wav")} from={TAP_FIN + 18} volume={0.45} />
    </StepFrame>
  );
};
