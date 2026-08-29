import Link from "next/link";
import AdBanner from "../components/AdBanner.tsx";
import { SITE_TAGLINE } from "./config/site.ts";
import HomeJoinForm from "./HomeJoinForm.tsx";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">hlasuju.cz</h1>
        <p className="mt-3 text-lg text-gray-600">{SITE_TAGLINE}</p>

        {/* Účastník je vizuálně dominantnější — většina lidí na
            homepage přichází zadat kód, ne založit hlasování (viz zadání). */}
        <section className="mt-10 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">Jsem účastník</h2>
          <div className="mt-4">
            <HomeJoinForm />
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Jsem moderátor</h2>
          <Link
            href="/vytvorit"
            className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border-2 border-gray-200 px-6 text-base font-semibold text-gray-800 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            Vytvořit hlasování
          </Link>
        </section>

        <p className="mt-8 text-sm text-gray-500">Bez registrace. Zdarma. Hotovo za pár sekund.</p>

        <div className="mt-10">
          <AdBanner />
        </div>
      </div>
    </main>
  );
}
