import { ImageResponse } from "next/og";

export const alt = "RYDAR Privé — Chauffeur privé · Private chauffeur, Paris";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE: Record<string, [string, string]> = {
  fr: ["Votre chauffeur.", "Votre prochain départ."],
  en: ["Your chauffeur.", "Your next departure."],
};

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const [l1, l2] = TAGLINE[lang] ?? TAGLINE.fr;
  const trails = [
    { top: 430, rot: -9, color: "rgba(236,243,247,0.9)", w: 900 },
    { top: 455, rot: -8, color: "rgba(236,243,247,0.5)", w: 1000 },
    { top: 480, rot: -7, color: "rgba(214,64,52,0.75)", w: 1100 },
    { top: 505, rot: -6, color: "rgba(214,64,52,0.45)", w: 1200 },
  ];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "radial-gradient(120% 90% at 85% 50%, #18222a 0%, #080a0c 60%)",
        color: "#f1f0ec",
        position: "relative",
        fontFamily: "serif",
      }}
    >
      {trails.map((t, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 1200 - t.w,
            top: t.top,
            width: t.w + 120,
            height: 3,
            transform: `rotate(${t.rot}deg)`,
            background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${t.color} 70%, rgba(0,0,0,0) 100%)`,
          }}
        />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            border: "2px solid #a9bbc5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            color: "#dbe3e8",
          }}
        >
          R
        </div>
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 12, color: "#f1f0ec" }}>RYDAR</div>
        <div style={{ display: "flex", fontSize: 16, letterSpacing: 8, color: "#a9bbc5" }}>PRIVÉ</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 88, lineHeight: 1.02 }}>
        <div style={{ display: "flex" }}>{l1}</div>
        <div style={{ display: "flex", fontStyle: "italic", color: "#c9d6dd" }}>{l2}</div>
      </div>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#8f989e" }}>PARIS · CDG · ORLY · FR / EN</div>
    </div>,
    size,
  );
}
