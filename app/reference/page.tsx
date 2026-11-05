import Link from "next/link";
import { Section, comparisonMetadata, ctaClass } from "../../components/comparison/ComparisonPage.tsx";
import { Quote, ReferenceShell } from "../../components/reference/ReferenceShell.tsx";

export const metadata = comparisonMetadata(
  "/reference",
  "Reference a zkušenosti uživatelů | Hlasuju.cz",
  "Jak Hlasuju.cz posloužilo při bodovaném kvízu s rentgenovými snímky na PaRaKo 2026, co o něm říkají uživatelé a deset nápadů na vlastní hlasování."
);

const IDEAS = [
  {
    title: "Poznáte kolegy podle fotek z dětství?",
    text: "Na firemním večírku promítnete fotky a ostatní na mobilech hádají, kdo je kdo.",
  },
  {
    title: "Který konec příběhu zahrajeme?",
    text: "Diváci dětského představení nebo improvizačního večera hlasují, jak bude děj pokračovat. Herci pak hrají podle výsledku.",
  },
  {
    title: "Pochopili studenti dnešní látku?",
    text: "Několik otázek na konci hodiny ukáže, co je potřeba znovu vysvětlit.",
  },
  {
    title: "Která pomazánka vyhraje sousedskou ochutnávku?",
    text: "Vzorky dostanou čísla a ochutnávající hlasují pro favorita. Kdo co připravil, prozradíte až po výsledcích.",
  },
  {
    title: "Jak dobře znáte novomanžele?",
    text: "Svatebčané tipují, kdo udělal první krok nebo kdo častěji ztrácí klíče. Pak pár prozradí správnou odpověď.",
  },
  {
    title: "Který návrh vybereme?",
    text: "Porovnejte konkrétní varianty plakátu, loga nebo třídního trička a nechte skupinu vybrat.",
  },
  {
    title: "Odhalíte podvodný e-mail?",
    text: "Při školení promítnete ukázky zpráv a účastníci rozhodují, které by otevřeli a které nahlásili.",
  },
  {
    title: "Co si odnášíte ze školení?",
    text: "Krátké ověření znalostí a zpětná vazba na závěr.",
  },
  {
    title: "Jak dopadne náš tip?",
    text: "Před pokusem nechte třídu odhadnout, který předmět se potopí nebo která konstrukce unese největší zátěž. Pak výsledek společně ověřte.",
  },
  {
    title: "Kolik bodů získá váš rodič?",
    text: "Na školní akci odpovídají rodiče na stejné otázky jako jejich děti. Ukáže se, kdo by dnes zvládl jejich učivo.",
  },
];

export default function ReferencePage() {
  return (
    <ReferenceShell>
      <header className="mx-auto mt-8 max-w-2xl text-balance text-center sm:mt-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">Reference a zkušenosti s Hlasuju.cz</h1>
        <p className="mt-4 text-pretty text-base text-gray-600 sm:text-lg">
          Podívejte se, jak lidé používají Hlasuju.cz při přednáškách, výuce i společném rozhodování. A načerpejte nápady pro vlastní
          hlasování.
        </p>
      </header>

      <Section title="Kde už Hlasuju.cz pomohlo">
        <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-soft sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark">
            Odborná konference · <time dateTime="2026-11-05">5. listopadu 2026</time>
          </p>
          <h3 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">Interaktivní kvíz s rentgenovými snímky na PaRaKo 2026</h3>
          <p className="mt-3 text-pretty text-gray-700">
            Při příspěvku na Pardubickém radiologickém kolokviu prošlo publikum 12 rentgenových případů. U každého vybíralo na svých
            mobilech ze tří možností odpovědi a za odpovědi sbíralo body. Podle výsledného skóre se rozdělovaly symbolické ceny.
          </p>
          <Link
            href="/reference/parako-2026"
            className="mt-4 inline-block font-semibold text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            Jak hlasování probíhalo →
          </Link>
        </article>
      </Section>

      <Section title="Co říkají uživatelé">
        <p>Dvě zkušenosti lidí, kteří Hlasuju.cz použili po svém. Texty jsou jen lehce jazykově upravené.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Quote caption="Zkušenost uživatele z výuky">Konečně mí studenti použijí ten mobil k něčemu užitečnému.</Quote>
          <Quote caption="Zkušenost uživatele z plánování společné dovolené">
            Jsme parta spřátelených rodin a každý rok si společně pronajímáme chatu. Aplikaci jsme použili k hlasování o tom, kam pojedeme.
          </Quote>
        </div>
      </Section>

      <section id="napady" className="mx-auto mt-12 max-w-3xl scroll-mt-6 sm:mt-16">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">10 našich nápadů, jak využít Hlasuju.cz</h2>
        <p className="mt-4 text-pretty leading-relaxed text-gray-700">
          Hledáte nápad pro vlastní hlasování? Tady je deset situací, ve kterých můžete Hlasuju.cz vyzkoušet. Jde o inspiraci od tvůrců
          aplikace, ne o další reference.
        </p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {IDEAS.map((idea, index) => (
            <li key={idea.title} className="flex gap-3 rounded-2xl border border-gray-200 bg-white/80 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light font-bold text-brand-dark" aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <span className="block font-semibold text-gray-900">{idea.title}</span>
                <span className="mt-1 block text-pretty text-gray-700">{idea.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-12 max-w-3xl rounded-3xl bg-brand-light/60 p-6 text-center sm:mt-16 sm:p-10">
        <p className="text-balance text-xl font-bold text-gray-900">Máte vlastní nápad? Vyzkoušejte ho.</p>
        <p className="mt-2 text-gray-600">Bez registrace a bez instalace – stačí připravit otázky.</p>
        <Link href="/vytvorit" className={`mt-6 ${ctaClass}`}>
          Vytvořit vlastní hlasování
        </Link>
      </section>
    </ReferenceShell>
  );
}
