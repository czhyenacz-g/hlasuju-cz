import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Jednoduché typografické zatržítko na indigo pozadí — žádný externí
// obrázek, žádná ikonová knihovna (viz zadání "nedělej komplikované logo").
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#4f46e5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
        }}
      >
        <div style={{ fontSize: 36, color: "#ffffff", display: "flex" }}>✓</div>
      </div>
    ),
    { ...size }
  );
}
