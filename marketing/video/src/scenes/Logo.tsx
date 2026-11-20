import { C, sans, mono } from "../theme";

// Logo [Auxili] OS reconstruido en código
export const Logo: React.FC<{ size?: number; ink?: string }> = ({ size = 1, ink = C.text }) => {
  const bracket = (side: "left" | "right"): React.CSSProperties => ({
    width: 34 * size,
    height: 200 * size,
    border: `${14 * size}px solid ${C.orange}`,
    [side === "left" ? "borderRight" : "borderLeft"]: "none",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 * size }}>
      <div style={bracket("left")} />
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 170 * size, color: ink, letterSpacing: -4 * size, lineHeight: 1 }}>
        Auxili
      </div>
      <div style={bracket("right")} />
      <div
        style={{
          marginLeft: 16 * size,
          background: C.orange,
          color: "#14161b",
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 76 * size,
          padding: `${4 * size}px ${22 * size}px`,
          borderRadius: 8 * size,
          alignSelf: "flex-start",
          marginTop: 22 * size,
        }}
      >
        OS
      </div>
    </div>
  );
};
