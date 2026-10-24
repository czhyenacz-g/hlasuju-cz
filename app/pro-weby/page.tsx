import type { Metadata } from "next";
import Link from "next/link";
import VotingBackdrop from "../../components/VotingBackdrop.tsx";
import { SITE_NAME, SITE_URL } from "../config/site.ts";

const TITLE = "Hlasování a ankety pro váš web";
const DESCRIPTION = "Vytvořte anketu, sdílejte odkaz nebo ji vložte přímo na své stránky. Bez registrace a bez programování.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pro-weby` },
  openGraph: { type: "website", url: `${SITE_URL}/pro-weby`, siteName: SITE_NAME, locale: "cs_CZ", title: TITLE, description: DESCRIPTION },
};

const SHARE = ["Facebook", "Messenger", "WhatsApp", "E-mail", "Zkopírování odkazu"];
const EMBED = ["Blog", "Článek", "Školní web", "Firemní web", "Web spolku"];
const STEPS = ["Vytvořte otázku.", "Získejte odkaz nebo kód.", "Sdílejte a sledujte výsledky."];

const ctaClass =
  "inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-brand px-8 text-lg font-semibold text-white shadow-soft transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30";

export default function ForWebsitesPage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-4xl px-4 py-8 sm:py-14">
      <VotingBackdrop />
      <Link href="/" className="text-lg font-bold tracking-tight text-brand hover:text-brand-dark">
        hlasuju.cz
      </Link>

      <header className="mx-auto mt-8 max-w-2xl text-balance text-center sm:mt-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">{TITLE}</h1>
        <p className="mt-4 text-base text-gray-600 sm:text-lg">{DESCRIPTION}</p>
        <Link href="/pro-weby/vytvorit" className={`mt-8 ${ctaClass}`}>
          Vytvořit anketu pro web
        </Link>
      </header>

      <div className="mt-12 grid gap-4 sm:mt-16 sm:gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">Sdílet anketu</h2>
          <p className="mt-2 text-gray-600">Pošlete odkaz – při sdílení se zobrazí náhled s otázkou.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SHARE.map((item) => (
              <li key={item} className="rounded-full bg-pastel-blue px-3 py-1 text-sm text-gray-800">
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">Vložit na web</h2>
          <p className="mt-2 text-gray-600">Zkopírujte krátký kód a vložte anketu přímo do stránky.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {EMBED.map((item) => (
              <li key={item} className="rounded-full bg-pastel-green px-3 py-1 text-sm text-gray-800">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-12 sm:mt-16">
        <h2 className="text-center text-xl font-bold text-gray-900">Jak to funguje</h2>
        <ol className="mx-auto mt-6 grid max-w-3xl gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 sm:flex-col sm:text-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">{index + 1}</span>
              <span className="font-medium text-gray-800">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 text-center">
        <Link href="/pro-weby/vytvorit" className={ctaClass}>
          Vytvořit anketu pro web
        </Link>
      </p>
      <p className="mx-auto mt-6 max-w-xl text-center text-xs text-gray-500">
        Hlasuje se anonymně a jednou z jednoho zařízení. Výsledky jsou orientační, nejde o reprezentativní průzkum. Anketa platí 30 dní od
        posledního hlasu.
      </p>
    </main>
  );
}
