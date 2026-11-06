import Link from "next/link";
import { ComparisonShell, ctaClass, comparisonMetadata } from "../../components/comparison/ComparisonPage.tsx";

export const metadata = comparisonMetadata(
  "/srovnani",
  "Srovnání nástrojů pro online hlasování | Hlasuju.cz",
  "Hlasuju.cz ve srovnání s Mentimeterem, Slido a Kahootem: co umí zdarma, kdy se hodí který nástroj a v čem je Hlasuju.cz jednodušší."
);

const ITEMS = [
  {
    href: "/alternativa-mentimeter",
    title: "Hlasuju.cz vs. Mentimeter",
    text: "Pro školení a přednášky: obsahové slajdy, otázky a kvízy. Mentimeter má víc typů slajdů, Hlasuju.cz nemá měsíční limit účastníků ani povinný účet.",
  },
  {
    href: "/alternativa-slido",
    title: "Hlasuju.cz vs. Slido",
    text: "Pro porady a setkání: víc anket na jedné akci bez placení. Slido navíc nabízí dotazy publika a napojení na PowerPoint nebo Teams.",
  },
  {
    href: "/alternativa-kahoot",
    title: "Hlasuju.cz vs. Kahoot!",
    text: "Pro kvízy ve třídě: body, bonus za rychlost, počítadlo času a pořadí. Kahoot! je víc hra, s body podle rychlosti a více typy otázek.",
  },
];

export default function ComparisonHubPage() {
  return (
    <ComparisonShell>
      <header className="mx-auto mt-8 max-w-2xl text-balance text-center sm:mt-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">Srovnání nástrojů pro online hlasování</h1>
        <p className="mt-4 text-pretty text-base text-gray-600 sm:text-lg">
          Hlasuju.cz je česká služba pro živé hlasování, kvízy a interaktivní prezentace. Autor ani účastníci nepotřebují účet, hlasuje se
          z mobilu přes kód nebo QR. Podívejte se, v čem se liší od známých zahraničních nástrojů – a kdy se vám víc hodí ony.
        </p>
      </header>

      <ul className="mx-auto mt-10 grid max-w-3xl gap-4">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-3xl border border-gray-200 bg-white p-6 shadow-soft transition hover:border-brand/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
            >
              <h2 className="text-xl font-bold text-gray-900">{item.title}</h2>
              <p className="mt-2 text-pretty text-gray-600">{item.text}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-brand">Přečíst srovnání →</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-center">
        <Link href="/vytvorit" className={ctaClass}>
          Vytvořit hlasování
        </Link>
      </p>
    </ComparisonShell>
  );
}
