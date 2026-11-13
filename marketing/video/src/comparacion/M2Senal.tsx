import { interpolate, useCurrentFrame } from "remotion";
import { C, clamp, mono, sans } from "../theme";
import { Split } from "./Split";
import { AMBER, fade, PaperSlip, Phone, Scribble, Verdict } from "./ui";

export const M2_DUR = 150;

const Rain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      {Array.from({ length: 34 }).map((_, i) => {
        const x = (i * 137) % 1080;
        const speed = 26 + (i % 5) * 4;
        const y = ((f * speed + i * 211) % 760) - 80;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 3, height: 46, borderRadius: 2, background: "rgba(170,190,220,0.45)", rotate: "12deg" }} />;
      })}
    </>
  );
};

const PaperSide: React.FC = () => {
  const f = useCurrentFrame();
  const blur = interpolate(f, [20, 90], [0, 5], clamp);
  return (
    <>
      <PaperSlip blur={blur}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 70 }}>
          <Scribble y={20} w={330} from={-1} to={0} seed={1} blur={blur} />
          <Scribble y={70} w={280} from={-1} to={0} seed={2} blur={blur} />
          <Scribble y={120} w={310} from={-1} to={0} seed={3} blur={blur} />
          <Scribble y={170} w={200} from={-1} to={0} seed={4} blur={blur} />
        </div>
        {[
          [60, 140, 30],
          [220, 260, 45],
          [120, 360, 55],
        ].map(([x, y, d], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: 200,
              height: 170,
              borderRadius: "50%",
              background: "rgba(90,80,50,0.22)",
              scale: interpolate(f, [d, d + 40], [0, 1.2], clamp),
            }}
          />
        ))}
      </PaperSlip>
      <Rain />
      <Verdict ok={false} at={78} title="Se mojó en la guantera" sub="Y con él, la prueba del servicio." />
    </>
  );
};

const SoloSide: React.FC = () => {
  const f = useCurrentFrame();
  const back = f >= 82;
  return (
    <>
      <Phone signal={back ? "ok" : "off"}>
        <div
          style={{
            borderRadius: 14,
            padding: "14px 16px",
            fontFamily: sans,
            fontWeight: 700,
            fontSize: 22,
            lineHeight: 1.25,
            background: back ? "rgba(39,196,122,0.16)" : "rgba(245,166,35,0.16)",
            color: back ? C.green : AMBER,
            border: `2px solid ${back ? C.green : AMBER}`,
            opacity: fade(f, 12, 18),
          }}
        >
          {back ? "Listo: se subieron 3 cambios" : "Sin señal · lo que cargues queda guardado en el teléfono"}
        </div>
        {[
          ["Remito N.º 0483", 30],
          ["Gasto · Peaje", 44],
          ["Remito N.º 0484", 58],
        ].map(([t, d]) => (
          <div
            key={t as string}
            style={{
              marginTop: 14,
              background: "#191d27",
              border: "2px solid #2a3040",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              opacity: fade(f, d as number, (d as number) + 6),
              translate: interpolate(f, [d as number, (d as number) + 10], ["0px 20px", "0px 0px"], clamp),
            }}
          >
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: C.text }}>{t}</span>
            <span style={{ fontFamily: mono, fontSize: 16, color: back ? C.green : C.muted }}>{back ? "✓ subido" : "en el teléfono"}</span>
          </div>
        ))}
      </Phone>
      <Verdict ok at={94} title="Funciona sin señal" sub="Se sube solo cuando vuelve." />
    </>
  );
};

export const M2Senal: React.FC = () => <Split dur={M2_DUR} time="14:15" prevTime="09:40" label="SIN SEÑAL" paper={<PaperSide />} solo={<SoloSide />} />;
