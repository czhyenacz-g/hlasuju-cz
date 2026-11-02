import Link from "next/link";
import {
  Bullets,
  ComparisonShell,
  ComparisonTable,
  Faq,
  FinalCta,
  Hero,
  OtherComparisons,
  Section,
  Sources,
  Steps,
  comparisonMetadata,
  type ComparisonRow,
} from "../../components/comparison/ComparisonPage.tsx";

export const metadata = comparisonMetadata(
  "/alternativa-slido",
  "Slido alternativa pro online hlasování | Hlasuju.cz",
  "Rychlé ankety na poradách a setkáních bez registrace a v češtině. Srovnání Hlasuju.cz a Slido: limity zdarma, počet anket, Q&A a integrace."
);

const ROWS: ComparisonRow[] = [
  {
    label: "Použití zdarma",
    us: "Zdarma, bez placených tarifů.",
    them: "Tarif Basic zdarma, dále jednorázové, roční a školní tarify.",
  },
  {
    label: "Počet anket",
    us: "Až 30 otázek v jednom hlasování.",
    them: "Basic: 3 ankety a 1 kvíz na jednu akci (v některých regionech 5 anket).",
  },
  {
    label: "Účastníci",
    us: "Počet účastníků neomezuje tarif. Server chrání jen limity proti zneužití.",
    them: "Basic: až 100 účastníků na akci.",
  },
  {
    label: "Registrace autora",
    us: "Není potřeba.",
    them: "Potřeba (bezplatný účet).",
  },
  {
    label: "Registrace účastníka",
    us: "Není potřeba. Volitelně jméno nebo přezdívka.",
    them: "Není potřeba – připojení kódem, odkazem nebo QR kódem.",
  },
  {
    label: "Čeština",
    us: "Celé rozhraní je česky.",
    them: "Rozhraní pro účastníky lze nastavit česky (Slido nabízí 40 jazyků).",
  },
  {
    label: "Dotazy publika (Q&A)",
    us: "Ne.",
    them: "Ano – účastníci se ptají a hlasují pro dotazy ostatních.",
  },
  {
    label: "Integrace",
    us: "Ne. Hlasování běží v prohlížeči vedle vaší prezentace.",
    them: "Mimo jiné PowerPoint, Google Slides, Microsoft Teams a Webex.",
  },
];

export default function SlidoAlternativePage() {
  return (
    <ComparisonShell crumb="Slido">
      <Hero
        title="Česká alternativa ke Slido pro online hlasování"
        intro={
          <p>
            Potřebujete na poradě rychle zjistit názor týmu nebo na setkání nechat lidi vybrat termín? Na Hlasuju.cz napíšete otázky,
            ukážete kód a během pár vteřin vidíte výsledky. Bez účtu a bez omezení na tři ankety.
          </p>
        }
      />

      <Section title="V čem se Hlasuju.cz a Slido liší">
        <p>
          Slido je silné hlavně v dotazech publika a v napojení na PowerPoint, Teams a další nástroje. Hlasuju.cz se soustředí jen na
          hlasování: více otázek v jednom hlasování i bez placení, žádný účet a české rozhraní pro všechny. Dotazy publika (Q&A) ani
          integrace nenabízí.
        </p>
        <ComparisonTable competitor="Slido" rows={ROWS} caption="Srovnání Hlasuju.cz a Slido" />
      </Section>

      <Section title="Příklad: pondělní porada oddělení">
        <p>Vedoucí týmu chce na poradě rozhodnout tři věci a nechce, aby rozhodoval jen ten, kdo mluví nejhlasitěji.</p>
        <Steps
          steps={[
            <>
              Před poradou na stránce{" "}
              <Link href="/vytvorit" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
                Vytvořit hlasování
              </Link>{" "}
              zadá otázky: termín teambuildingu, priorita na příští sprint a „Vyhovuje vám porada v pondělí?“.
            </>,
            "Na poradě ukáže šestimístný kód. Kolegové hlasují z mobilu nebo notebooku, i ti připojení online.",
            "Každou otázku spustí, až na ni dojde řeč, a po hlasování ji ukončí. Výsledky jsou hned na obrazovce.",
            "Hlasování zůstává anonymní, takže lidé odpovídají upřímněji.",
          ]}
        />
      </Section>

      <Section title="Kdy zvolit Hlasuju.cz">
        <Bullets
          items={[
            "Na jedné poradě nebo setkání potřebujete víc než tři ankety a nechcete kvůli tomu platit.",
            "Nechcete zakládat účet – například hlasujete jednorázově na schůzi spolku nebo SVJ.",
            "Hlasují lidé, kterým je příjemnější čeština, a vy chcete české i ovládání.",
            <>
              Potřebujete samostatnou anketu na web nebo do skupiny na sociální síti –{" "}
              <Link href="/pro-weby" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
                ankety pro web
              </Link>{" "}
              to umí.
            </>,
          ]}
        />
      </Section>

      <Section title="Kdy může být vhodnější Slido">
        <Bullets
          items={[
            "Hlavním cílem jsou dotazy publika: lidé posílají otázky a hlasují, které se mají probrat jako první. Hlasuju.cz to neumí.",
            "Chcete hlasovat přímo uvnitř PowerPointu, Google Slides nebo Microsoft Teams.",
            "Potřebujete jiné typy otázek než výběr z možností, například slovní mrak.",
            "Potřebujete omezit, kdo se připojí – například heslem akce nebo jen pro e-maily z vaší organizace.",
          ]}
        />
      </Section>

      <Section title="Časté otázky">
        <Faq
          items={[
            {
              q: "Funguje Hlasuju.cz i na online poradě?",
              a: "Ano. Stačí v hovoru sdílet obrazovku s kódem nebo poslat odkaz do chatu. Účastníci hlasují v prohlížeči na libovolném zařízení.",
            },
            {
              q: "Mohou účastníci posílat vlastní dotazy?",
              a: "Ne. Hlasuju.cz nemá dotazy publika (Q&A). Pokud je potřebujete, je Slido vhodnější volba.",
            },
            {
              q: "Je hlasování anonymní?",
              a: "Ve výchozím stavu ano – vidíte jen počty hlasů. Jmenovité hlasování můžete zapnout při vytváření, účastníci pak před hlasováním zadají jméno.",
            },
            {
              q: "Jde jeden člověk hlasovat vícekrát?",
              a: "Z jednoho prohlížeče hlasuje každý k otázce jen jednou. Není to ale volební systém: kdo použije jiné zařízení nebo anonymní okno, může hlasovat znovu. Na závazná rozhodnutí se proto nehodí.",
            },
          ]}
        />
      </Section>

      <FinalCta text="Připravte anketu na příští poradu." />

      <Sources
        sources={[
          { label: "Slido – ceník a integrace (slido.com/pricing)", href: "https://www.slido.com/pricing" },
          { label: "Slido – Live Q&A", href: "https://www.slido.com/features-live-qa" },
          { label: "Slido Community – Secure your slido (omezení přístupu)", href: "https://community.slido.com/security-privacy-essentials-224/secure-your-slido-491" },
          {
            label: "Slido Community – How many polls can I use in the free plan? (odpovědi týmu Slido, 10/2025)",
            href: "https://community.slido.com/community-q-a-7/how-many-polls-can-i-use-in-the-free-plan-6781",
          },
          {
            label: "Slido Community – How many polls can I use with the Basic plan? (regionální výjimka)",
            href: "https://community.slido.com/community-q-a-7/how-many-polls-can-i-use-with-the-basic-plan-1833",
          },
          {
            label: "Slido Community – How to join Slido as a participant",
            href: "https://community.slido.com/slido-fundamentals-205/how-to-join-slido-as-a-participant-472",
          },
          {
            label: "Slido Community – Create your slido (účet autora)",
            href: "https://community.slido.com/creating-testing-your-slido-208/create-your-slido-403",
          },
          {
            label: "Slido Community – Change the language for your slido",
            href: "https://community.slido.com/general-settings-220/change-the-language-for-your-slido-434",
          },
        ]}
      />

      <OtherComparisons current="/alternativa-slido" />
    </ComparisonShell>
  );
}
