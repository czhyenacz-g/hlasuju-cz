import Link from "next/link";
import AlphegaAffiliateBanner from "../components/AlphegaAffiliateBanner.tsx";
import VotingBackdrop from "../components/VotingBackdrop.tsx";
import HomeJoinForm from "./HomeJoinForm.tsx";

const BENEFITS = [
  { title: "Bez registrace", icon: "M5 12.5l4 4 10-10" },
  { title: "Funguje na mobilu", icon: "M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2" },
  { title: "Výsledky okamžitě", icon: "M5 20V11M12 20V5M19 20v-6" },
];

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center px-4 py-8 sm:py-16">
      <VotingBackdrop />

      <div className="w-full max-w-4xl">
        <p className="text-center text-lg font-bold tracking-tight text-brand">hlasuju.cz</p>

        <div className="mx-auto mt-5 max-w-3xl text-balance text-center sm:mt-10">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">Hlasování, které zapojí každého.</h1>
          <p className="mt-3 text-base text-gray-600 sm:mt-4 sm:text-lg">
            Ankety, kvízy a interaktivní přednášky na jednom místě. Bez registrace, bez instalace. Zvládne to každý.
          </p>
        </div>

        {/* Účastník je první a výraznější — většina lidí na homepage
            přichází zadat kód; na mobilu musí být pole hned vidět. */}
        <div className="mt-6 grid gap-4 sm:mt-12 sm:gap-6 md:grid-cols-5">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft sm:p-8 md:col-span-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand">Jsem účastník</h2>
            <p className="mt-1 text-sm text-gray-600">Zadejte šestimístný kód, který vidíte na plátně.</p>
            <div className="mt-4">
              <HomeJoinForm />
            </div>
          </section>

          <section className="flex flex-col rounded-3xl border border-gray-200 bg-white/80 p-6 sm:p-8 md:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Jsem moderátor</h2>
            <p className="mt-1 text-sm text-gray-600">
              Připravte otázky, ukažte kód nebo QR a sledujte, jak přibývají hlasy.
            </p>
            <Link
              href="/vytvorit"
              className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl border-2 border-brand/30 bg-brand-light/60 px-6 text-base font-semibold text-brand-dark transition hover:border-brand hover:bg-brand-light focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 md:mt-auto"
            >
              Vytvořit hlasování
            </Link>
          </section>
        </div>

        <p className="mt-6 text-center">
          <Link
            href="/pro-weby"
            className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-brand-dark underline-offset-4 hover:bg-white/70 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            Hlasování a ankety pro váš web →
          </Link>
        </p>

        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-gray-600 sm:mt-8">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pastel-green text-gray-700">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={benefit.icon} />
                </svg>
              </span>
              {benefit.title}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-12 max-w-2xl sm:mt-16">
          <AlphegaAffiliateBanner variant="standard" />
        </div>
      </div>
    </main>
  );
}
