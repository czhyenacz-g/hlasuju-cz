import type { Metadata } from "next";
import Link from "next/link";
import Logo from "../Logo.tsx";
import { SITE_NAME, SITE_URL } from "../../app/config/site.ts";

/**
 * Sdílená kostra srovnávacích stránek (/srovnani, /alternativa-*).
 * Obsah a argumentace jsou v jednotlivých page.tsx — tady je jen vzhled.
 *
 * Fakta o konkurentech mají vždy odkaz na oficiální zdroj a datum ověření
 * (COMPARISON_VERIFIED_AT). Při změně údajů aktualizuj datum i `lastmod`
 * v app/sitemap.ts.
 */
export const COMPARISON_VERIFIED_AT = "2. 11. 2026";
export const COMPARISON_LAST_MODIFIED = new Date("2026-11-03");

export function comparisonMetadata(path: string, title: string, description: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    // `absolute` — titulky už obsahují „| Hlasuju.cz“ v požadovaném tvaru.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: SITE_NAME, locale: "cs_CZ", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const ctaClass =
  "inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-brand px-8 text-lg font-semibold text-white shadow-soft transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30";

const linkClass = "font-semibold text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";

export function ComparisonShell({ crumb, children }: { crumb?: string; children: React.ReactNode }) {
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
                <Link href="/srovnani" className={linkClass}>
                  Srovnání
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
          <Link href="/srovnani" className={linkClass}>
            Srovnání nástrojů
          </Link>{" "}
          ·{" "}
          <Link href="/pro-weby" className={linkClass}>
            Ankety pro web
          </Link>
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs">
          Mentimeter, Slido a Kahoot! jsou ochranné známky svých vlastníků. Hlasuju.cz s nimi nijak nespolupracuje, jména uvádíme jen kvůli
          srovnání.
        </p>
      </footer>
    </main>
  );
}

export function Hero({ title, intro, children }: { title: string; intro: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mx-auto mt-8 max-w-2xl text-balance text-center sm:mt-12">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">{title}</h1>
      <div className="mt-4 text-pretty text-base text-gray-600 sm:text-lg">{intro}</div>
      <Link href="/vytvorit" className={`mt-8 ${ctaClass}`}>
        Vytvořit hlasování
      </Link>
      {children}
    </header>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-12 max-w-3xl sm:mt-16">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-4 text-pretty leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

export type ComparisonRow = { label: string; us: React.ReactNode; them: React.ReactNode };

/**
 * Srovnávací tabulka. Na mobilu se řádek zalomí: název vlastnosti přes
 * celou šířku, pod ním dvě buňky vedle sebe s vlastním popiskem (záhlaví
 * tabulky je skryté), takže nic nepřetéká do stran.
 */
export function ComparisonTable({ competitor, rows, caption }: { competitor: string; rows: ComparisonRow[]; caption: string }) {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-soft">
      <table className="w-full border-collapse text-left text-sm sm:text-base">
        <caption className="sr-only">{caption}</caption>
        <thead className="hidden bg-gray-50 sm:table-header-group">
          <tr>
            <th scope="col" className="w-1/4 px-5 py-3 font-semibold text-gray-600">
              <span className="sr-only">Vlastnost</span>
            </th>
            <th scope="col" className="px-5 py-3 font-semibold text-brand-dark">
              Hlasuju.cz
            </th>
            <th scope="col" className="px-5 py-3 font-semibold text-gray-800">
              {competitor}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="grid grid-cols-2 border-t border-gray-100 first:border-t-0 sm:table-row sm:first:border-t">
              <th scope="row" className="col-span-2 px-4 pb-1 pt-4 align-top font-semibold text-gray-900 sm:px-5 sm:py-4">
                {row.label}
              </th>
              <td className="px-4 pb-4 align-top text-gray-700 sm:px-5 sm:py-4">
                <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-brand-dark sm:hidden">Hlasuju.cz</span>
                {row.us}
              </td>
              <td className="px-4 pb-4 align-top text-gray-700 sm:px-5 sm:py-4">
                <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">{competitor}</span>
                {row.them}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="mt-4 grid gap-3">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 rounded-2xl bg-white/80 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">{index + 1}</span>
          <span className="pt-1">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-3 grid gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="mt-4 grid gap-3">
      {items.map((item) => (
        <details key={item.q} className="group rounded-2xl border border-gray-200 bg-white px-5 py-4 open:shadow-soft">
          <summary className="cursor-pointer list-none font-semibold text-gray-900 marker:hidden">
            <span className="flex items-start justify-between gap-4">
              {item.q}
              <span aria-hidden="true" className="text-brand transition group-open:rotate-45">
                +
              </span>
            </span>
          </summary>
          <div className="mt-3 text-gray-700">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

export function FinalCta({ text }: { text: string }) {
  return (
    <section className="mx-auto mt-12 max-w-3xl rounded-3xl bg-brand-light/60 p-6 text-center sm:mt-16 sm:p-10">
      <p className="text-balance text-xl font-bold text-gray-900">{text}</p>
      <p className="mt-2 text-gray-600">Bez registrace a bez instalace – stačí připravit otázky.</p>
      <Link href="/vytvorit" className={`mt-6 ${ctaClass}`}>
        Vytvořit hlasování
      </Link>
    </section>
  );
}

export function Sources({ sources }: { sources: { label: string; href: string }[] }) {
  return (
    <section className="mx-auto mt-12 max-w-3xl text-sm text-gray-600">
      <h2 className="text-base font-semibold text-gray-800">Zdroje</h2>
      <p className="mt-1">
        Údaje o ostatních nástrojích jsme ověřili {COMPARISON_VERIFIED_AT} na jejich oficiálních stránkách. Ceny a limity se mohou měnit – před
        rozhodnutím si je zkontrolujte u zdroje.
      </p>
      <ul className="mt-3 grid gap-1.5">
        {sources.map((source) => (
          <li key={source.href}>
            <a href={source.href} rel="nofollow noopener" target="_blank" className={`${linkClass} break-words font-medium`}>
              {source.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const COMPARISONS = [
  { href: "/alternativa-mentimeter", name: "Mentimeter", note: "interaktivní prezentace a školení" },
  { href: "/alternativa-slido", name: "Slido", note: "rychlé ankety na poradách a setkáních" },
  { href: "/alternativa-kahoot", name: "Kahoot!", note: "jednoduché kvízy s body a pořadím" },
];

export function OtherComparisons({ current }: { current: string }) {
  return (
    <nav aria-label="Další srovnání" className="mx-auto mt-12 max-w-3xl">
      <h2 className="text-base font-semibold text-gray-800">Další srovnání</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {COMPARISONS.filter((item) => item.href !== current).map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 transition hover:border-brand/30 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
            >
              <span className="font-semibold text-gray-900">Hlasuju.cz vs. {item.name}</span>
              <span className="block text-sm text-gray-600">{item.note}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/srovnani"
            className="block rounded-2xl border border-gray-200 bg-white/70 px-4 py-3 transition hover:border-brand/30 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            <span className="font-semibold text-gray-900">Všechna srovnání</span>
            <span className="block text-sm text-gray-600">přehled na jednom místě</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
