// Připravené místo pro budoucí reklamu/AdSense (viz zadání) — pro MVP
// bez publisher ID/reálného skriptu. V produkci nevykresluje nic (žádná
// rezervovaná prázdná plocha), v developmentu ukazuje placeholder, ať je
// vidět, kde reklama bude. Umísťuj JEN na homepage/moderátorskou
// stránku/čekací stav (viz zadání) — nikdy mezi otázku a odpovědi.
export default function AdSlot({ label = "Reklamní plocha", className = "" }: { label?: string; className?: string }) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-xs text-gray-400 ${className}`}
    >
      {label} (jen v development režimu)
    </div>
  );
}
