import type { PublicQuestionLink } from "../lib/polls/types.ts";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Odkaz u otázky ("Zdroj / Další informace"). URL je už na serveru
 * ověřená (jen http/https, lib/polls/validate.ts) — tady navíc kontrola
 * protokolu jako druhá pojistka, nová karta bez openeru/refereru.
 */
export default function QuestionLink({ link, className = "", large = false }: { link: PublicQuestionLink; className?: string; large?: boolean }) {
  if (!/^https?:\/\//i.test(link.url)) return null;
  const host = hostOf(link.url);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-brand/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold uppercase tracking-wide text-gray-500 ${large ? "text-sm" : "text-[11px]"}`}>
          Zdroj / Další informace
        </span>
        <span className={`block truncate font-semibold text-brand ${large ? "text-xl" : "text-sm"}`}>{link.label || host}</span>
        {link.label && <span className={`block truncate text-gray-500 ${large ? "text-base" : "text-xs"}`}>{host}</span>}
      </span>
      <span aria-hidden className="shrink-0 text-brand">
        ↗
      </span>
    </a>
  );
}
