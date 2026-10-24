"use client";

import { useEffect, useState } from "react";
import type { QuestionImage as QuestionImageData } from "../lib/polls/types.ts";

/**
 * Obrázek otázky — vždy celý (object-contain, žádný crop: u fotek
 * zranění nesmí zmizet podstatný detail), s rezervovaným místem podle
 * uložených rozměrů. Klik/tap otevře zvětšení přes celou obrazovku.
 *
 * `maxHeightClass` určuje, kolik výšky obrázek smí zabrat — na mobilu
 * účastníka málo (odpovědi musí zůstat na displeji), na projektoru hodně.
 */
export default function QuestionImage({
  image,
  maxHeightClass = "max-h-[40vh]",
  className = "",
  priority = false,
}: {
  image: QuestionImageData;
  maxHeightClass?: string;
  className?: string;
  priority?: boolean;
}) {
  const [zoomed, setZoomed] = useState(false);
  // Výpadek úložiště obrázků nesmí rozbít hlasování — místo rozbitého
  // obrázku jen nenápadná informace, otázka a odpovědi fungují dál.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const alt = image.alt || "Obrázek k otázce";

  if (failedUrl === image.url) {
    return (
      <div role="img" aria-label={alt} className={`rounded-2xl bg-gray-100 px-4 py-6 text-center text-sm text-gray-500 ${className}`}>
        Obrázek se teď nepodařilo načíst.
        <button type="button" onClick={() => setFailedUrl(null)} className="ml-1 font-semibold text-brand underline underline-offset-2">
          Zkusit znovu
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        className={`group relative mx-auto block max-w-full overflow-hidden rounded-2xl bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 ${className}`}
        aria-label={`Zvětšit obrázek: ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- obrázky z Content API bez Next image optimalizace (náklady); velikost řeší zmenšení při uploadu */}
        <img
          src={image.url}
          alt={alt}
          width={image.width}
          height={image.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailedUrl(image.url)}
          className={`mx-auto block h-auto w-auto max-w-full object-contain ${maxHeightClass}`}
        />
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white opacity-80 group-hover:opacity-100">
          Zvětšit
        </span>
      </button>
      {zoomed && <ImageLightbox image={image} alt={alt} onClose={() => setZoomed(false)} />}
    </>
  );
}

function ImageLightbox({ image, alt, onClose }: { image: QuestionImageData; alt: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-2 sm:p-6"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- viz výše */}
      <img src={image.url} alt={alt} className="max-h-full max-w-full object-contain" />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-gray-900 shadow focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        autoFocus
      >
        Zavřít ✕
      </button>
    </div>
  );
}
