import { appIconResponse } from "../lib/pwa/app-icon.tsx";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Favicon — stejný motiv jako logo a ikona aplikace (lib/pwa/app-icon.tsx).
export default function Icon() {
  return appIconResponse(size.width, { rounded: true });
}
