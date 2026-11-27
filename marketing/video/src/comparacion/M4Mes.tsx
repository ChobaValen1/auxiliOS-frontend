import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, clamp, display, mono, sans } from "../theme";
import { Split } from "./Split";
import { AMBER, countUp, fade, money, Phone, pop, Verdict } from "./ui";

export const M4_DUR = 180;

const PaperSide: React.FC = () => {
  const f = useCurrentFrame();
  const rows = ["1.250.000", "- 412.000", "- 180.000", "- 95.000 ?", "= 563.000"];
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 30,
          width: 430,
          height: 520,
          rotate: "2deg",
          background: "repeating-linear-gradient(180deg, #f4f1e8 0 54px, #b9c7dd 54px 56px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          borderLeft: "6px solid #d86a6a",
          padding: "40px 30px 0 46px",
        }}
      >
        {rows.map((r, i) => {
          const at = 10 + i * 12;
          return (
            <div key={r} style={{ position: "relative", height: 56, fontFamily: mono, fontWeight: 700, fontSize: 34, color: "#2a3a8a", opacity: fade(f, at, at + 5) }}>
              {r}
              {i === 3 || i === 4 ? (
                <div style={{ position: "absolute", left: -6, top: 22, height: 5, background: C.red, width: interpolate(f, [at + 10, at + 18], [0, 300], clamp), rotate: "-4deg" }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", left: 340, top: 160, fontFamily: display, fontSize: 340, color: C.red, opacity: fade(f, 84, 90), scale: pop(f, 84, 98), rotate: "8deg" }}>?</div>
      <Verdict ok={false} at={92} title="¿Cuánto me quedó?" sub="Cuentas a mano, a la noche." />
    </>
  );
};

const Mini: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ background: "#191d27", border: "2px solid #2a3040", borderRadius: 14, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 22, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 28, color }}>{money(countUp(f, 16, 56, value))}</span>
    </div>
  );
};

const SoloSide: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <>
      <Phone>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 32, color: C.text }}>Mis números</div>
          <div style={{ fontFamily: mono, fontSize: 18, color: C.muted }}>Octubre</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          <Mini label="Facturé" value={1250000} color={C.text} />
          <Mini label="Gasté" value={592000} color={C.text} />
          <Mini label="Me queda" value={658000} color={C.green} />
        </div>
        <div style={{ marginTop: 14, background: "#191d27", border: "2px solid #2a3040", borderRadius: 14, padding: "12px 14px", opacity: fade(f, 58, 64) }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 21, color: C.text }}>Punto de equilibrio</span>
            <span style={{ fontFamily: mono, fontSize: 16, color: AMBER }}>Faltan 4</span>
          </div>
          <div style={{ marginTop: 10, height: 12, borderRadius: 6, background: "#2a3040", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 6, background: AMBER, width: `${interpolate(f, [62, 100], [0, 82], { ...clamp, easing: Easing.out(Easing.cubic) })}%` }} />
          </div>
          <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 19, color: C.muted, marginTop: 8 }}>Llevás 18 de 22 servicios</div>
        </div>
      </Phone>
      <Verdict ok at={108} title="Sabés cuánto te queda" sub="Facturado, gastado y lo que deja cada servicio." />
    </>
  );
};

export const M4Mes: React.FC = () => <Split dur={M4_DUR} time="31/10" prevTime="18:30" label="FIN DE MES" paper={<PaperSide />} solo={<SoloSide />} />;
