import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Firma } from "./Firma";

// Vista previa: la firma se dibuja a la velocidad en que se grabó
export const FirmaPreview: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: "#0c0e12", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 920, height: 460, borderRadius: 28, background: "#f3f4f7", padding: 30 }}>
        <Firma ms={((f - 15) / fps) * 1000} />
      </div>
    </AbsoluteFill>
  );
};
