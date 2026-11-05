import { appIconResponse } from "../../../lib/pwa/app-icon.tsx";

// Ikony z manifestu (app/manifest.ts) — vygenerují se při buildu.
const ICONS = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name as keyof typeof ICONS];
  if (!icon) return new Response("Not Found", { status: 404 });
  return appIconResponse(icon.size, { maskable: icon.maskable });
}
