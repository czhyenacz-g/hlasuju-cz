import { appIconResponse } from "../lib/pwa/app-icon.tsx";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Ikona pro „Přidat na plochu“ na iPhonu (rohy zaoblí systém).
export default function AppleIcon() {
  return appIconResponse(size.width);
}
