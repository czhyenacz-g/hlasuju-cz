import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Section, Steps, ctaClass } from "../../../components/comparison/ComparisonPage.tsx";
import { JsonLd, Quote, REFERENCE_LAST_MODIFIED, REFERENCE_PUBLISHED, ReferenceShell } from "../../../components/reference/ReferenceShell.tsx";
import { SITE_NAME, SITE_URL } from "../../config/site.ts";

const PATH = "/reference/parako-2026";
const URL = `${SITE_URL}${PATH}`;
const TITLE = "Hlasování na PaRaKo 2026: 12 RTG případů | Hlasuju.cz";
const HEADLINE = "Interaktivní kvíz s rentgenovými snímky na PaRaKo 2026";
const DESCRIPTION =
  "Jak při příspěvku „Copak je to za Moribundus?“ na PaRaKo 2026 publikum hlasovalo přes mobil u 12 rentgenových případů, sbíralo body a soutěžilo o symbolické ceny.";
const CONFERENCE_URL = "https://fzs.upce.cz/fzs/radiologicke-kolokvium-2026";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: "article",
    url: URL,
    siteName: SITE_NAME,
    locale: "cs_CZ",
    title: TITLE,
    description: DESCRIPTION,
    publishedTime: REFERENCE_PUBLISHED,
    modifiedTime: REFERENCE_LAST_MODIFIED.toISOString().slice(0, 10),
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Article: autorem článku je Hlasuju.cz (přednášející článek nepsala).
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: HEADLINE,
      description: DESCRIPTION,
      inLanguage: "cs",
      datePublished: REFERENCE_PUBLISHED,
      dateModified: REFERENCE_LAST_MODIFIED.toISOString().slice(0, 10),
      mainEntityOfPage: URL,
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Úvod", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Reference", item: `${SITE_URL}/reference` },
        { "@type": "ListItem", position: 3, name: "PaRaKo 2026", item: URL },
      ],
    },
  ],
};

const linkClass = "font-semibold text-brand-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20";

export default function Parako2026Page() {
  return (
    <ReferenceShell crumb="PaRaKo 2026">
      <JsonLd data={STRUCTURED_DATA} />
      <article>
        <header className="mx-auto mt-8 max-w-3xl sm:mt-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark">
            Případová studie · <time dateTime="2026-11-05">5. listopadu 2026</time>
          </p>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">{HEADLINE}</h1>
          <p className="mt-5 text-pretty text-base leading-relaxed text-gray-700 sm:text-lg">
            Na 8. ročníku Pardubického radiologického kolokvia (PaRaKo 2026), které pořádala Fakulta zdravotnických studií Univerzity
            Pardubice, zazněl příspěvek „Copak je to za Moribundus?“. Mgr. Zdena Vilasová, Ph.D., z FZS Univerzity Pardubice při něm
            použila Hlasuju.cz, aby publikum zapojila do bodovaného kvízu s rentgenovými snímky.
          </p>
        </header>

        <section aria-labelledby="prehled" className="mx-auto mt-10 max-w-3xl">
          <h2 id="prehled" className="sr-only">
            Přehled na první pohled
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { value: "12", label: "rentgenových případů" },
              { value: "3", label: "možnosti odpovědi u každého případu" },
              { value: "📱", label: "odpovídání na vlastních mobilech" },
              { value: "🏆", label: "body a symbolické ceny podle skóre" },
            ].map((item) => (
              <li key={item.label} className="rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-soft">
                <span className="block text-3xl font-bold text-brand-dark" aria-hidden={/\d/.test(item.value) ? undefined : true}>
                  {item.value}
                </span>
                <span className="mt-1 block text-sm text-gray-700">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <Section title="Jak hlasování probíhalo">
          <Steps
            steps={[
              "Publikum vidělo rentgenový snímek příslušného případu.",
              "Účastníci na svých mobilech vybírali ze tří možností odpovědi.",
              "Odpovědi se bodovaly.",
              "Podle výsledného skóre se určilo pořadí pro udělení symbolických cen.",
            ]}
          />
        </Section>

        <Section title="Zkušenost s přípravou prezentace">
          <div className="mt-2">
            <Quote caption="Zkušenost autora ankety">
              Je vidět, že to někdo dobře odladil, aby vše bylo jednoduché a intuitivní. Když chci slajd s obsahem, přidám obsah. Když chci
              anketu, přidám otázku a možné odpovědi. Ani obrázky nejsou problém. Je super, že je lze zvětšit na celou obrazovku.
            </Quote>
          </div>
        </Section>

        <Section title="Využití podobného formátu">
          <p>
            Obrazový kvíz se hodí i do výuky, na školení nebo na jinou odbornou přednášku. Hlasuju.cz k tomu nabízí tyto možnosti (popis
            aplikace, ne průběhu PaRaKo):
          </p>
          <Bullets
            items={[
              "Ke každé otázce až tři obrázky vedle sebe. Na plátně i v mobilu jde obrázek zvětšit na celou obrazovku.",
              "Správná odpověď, body za ni a volitelný bonus pro nejrychlejší správné odpovědi.",
              "Slajd s výsledky za otázkou a slajd s průběžným pořadím účastníků.",
              "Volitelný odpočet sekund na odpověď a obsahové slajdy s textem mezi otázkami.",
            ]}
          />
          <p className="mt-4">
            <Link href="/reference#napady" className={linkClass}>
              Prohlédnout další nápady na použití
            </Link>
          </p>
        </Section>
      </article>

      <section className="mx-auto mt-12 max-w-3xl rounded-3xl bg-brand-light/60 p-6 text-center sm:mt-16 sm:p-10">
        <h2 className="text-balance text-xl font-bold text-gray-900">Zapojte publikum i při své přednášce</h2>
        <p className="mt-2 text-pretty text-gray-600">
          Připravte vlastní otázky, přidejte obrázky a nechte posluchače odpovídat z mobilů. Bez registrace a bez instalace.
        </p>
        <Link href="/vytvorit" className={`mt-6 ${ctaClass}`}>
          Vytvořit vlastní hlasování
        </Link>
      </section>

      <nav aria-label="Další odkazy" className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-between gap-3 text-sm">
        <Link href="/reference" className={linkClass}>
          ← Zpět na reference
        </Link>
        <a href={CONFERENCE_URL} target="_blank" rel="noopener" className={linkClass}>
          Oficiální stránka Radiologického kolokvia 2026 ↗
        </a>
      </nav>
    </ReferenceShell>
  );
}
