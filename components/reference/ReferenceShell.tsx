import Link from "next/link";
import Logo from "../Logo.tsx";

/**
 * Sdílená kostra stránek /reference a /reference/*. Styl a stavební
 * bloky (Section, ctaClass…) jsou společné se srovnávacími stránkami
 * (components/comparison/ComparisonPage.tsx).
 *
 * Obsah referencí je jen doložený: případové studie a citace dodal
 * majitel aplikace. Nápady na použití jsou zřetelně označené jako naše
 * inspirace, ne jako další reference.
 */

// Publikace sekce a poslední úprava obsahu (sitemap lastmod, Article).
// Při změně obsahu aktualizuj REFERENCE_LAST_MODIFIED.
export const REFERENCE_PUBLISHED = "2026-11-05";
export const REFERENCE_LAST_MODIFIED = new Date("2026-11-05");

const linkClass = "font-semibold text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";

export function ReferenceShell({ crumb, children }: { crumb?: string; children: React.ReactNode }) {
  return (
    <main className="relative mx-auto min-h-screen max-w-4xl px-4 py-8 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex rounded-lg hover:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20">
          <Logo />
        </Link>
        {crumb && (
          <nav aria-label="Drobečková navigace" className="text-sm text-gray-600">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className={linkClass}>
                  Úvod
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/reference" className={linkClass}>
                  Reference
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page">{crumb}</li>
            </ol>
          </nav>
        )}
      </div>
      {children}
      <footer className="mt-16 border-t border-gray-200 pt-6 text-center text-sm text-gray-500">
        <p>
          <Link href="/" className={linkClass}>
            hlasuju.cz
          </Link>{" "}
          ·{" "}
          <Link href="/reference" className={linkClass}>
            Reference
          </Link>{" "}
          ·{" "}
          <Link href="/srovnani" className={linkClass}>
            Srovnání nástrojů
          </Link>
        </p>
      </footer>
    </main>
  );
}

/** Citace: sémantický blockquote, bez hodnocení a hvězdiček. */
export function Quote({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <figure className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft">
      <blockquote className="text-pretty text-lg leading-relaxed text-gray-800">
        <p>„{children}“</p>
      </blockquote>
      <figcaption className="mt-3 text-sm font-medium text-gray-500">— {caption}</figcaption>
    </figure>
  );
}

/** JSON-LD (jen statická data stránky, žádný uživatelský vstup). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
