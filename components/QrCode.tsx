"use client";

import { QRCodeSVG } from "qrcode.react";

// Tenký wrapper nad qrcode.react (stejná knihovna jako KolikPiv.cz) —
// generuje se klientsky, žádný obrázek se neukládá (viz zadání).
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <QRCodeSVG value={value} size={size} level="M" />
    </div>
  );
}
