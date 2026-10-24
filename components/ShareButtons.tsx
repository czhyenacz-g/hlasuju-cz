"use client";

import { useEffect, useState } from "react";

/**
 * Obyčejné sdílení URL (žádné Graph API ani SDK třetích stran): Web Share
 * API tam, kde ho prohlížeč má (mobil → Messenger, WhatsApp, …), jinak
 * odkazy na sdílecí stránky služeb a kopírování odkazu.
 */
export default function ShareButtons({ url, text, compact = false }: { url: string; text: string; compact?: boolean }) {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: text, text, url });
    } catch {
      // Zavřený dialog sdílení není chyba.
    }
  }

  const u = encodeURIComponent(url);
  const links = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
    { label: "E-mail", href: `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n${url}`)}` },
  ];
  const buttonClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";

  return (
    <div className={compact ? "flex flex-wrap justify-center gap-2" : "flex flex-wrap gap-2"}>
      {canShare && (
        <button type="button" onClick={nativeShare} className={`${buttonClass} border-brand bg-brand text-white hover:bg-brand-dark hover:text-white`}>
          Sdílet…
        </button>
      )}
      {links.map((link) => (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className={buttonClass}>
          {link.label}
        </a>
      ))}
      <button type="button" onClick={copy} className={buttonClass}>
        {copied === "ok" ? "Zkopírováno ✓" : copied === "error" ? "Nepodařilo se zkopírovat" : "Kopírovat odkaz"}
      </button>
    </div>
  );
}
