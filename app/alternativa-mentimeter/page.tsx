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
  "/alternativa-mentimeter",
  "Mentimeter alternativa v češtině | Hlasuju.cz",
  "Hlasuju.cz je česká alternativa k Mentimeteru pro hlasování při školení a interaktivní prezentace: otázky, obsahové slajdy, kvízy s body. Bez registrace."
);

const ROWS: ComparisonRow[] = [
  {
    label: "Použití zdarma",
    us: "Zdarma, bez placených tarifů.",
    them: "Tarif Free zdarma; placené tarify od 11,99 USD za prezentujícího měsíčně (při ročním placení).",
  },
  {
    label: "Účastníci",
    us: "Počet účastníků neomezuje tarif. Server chrání jen limity proti zneužití.",
    them: "Free: 50 účastníků za měsíc (součet za všechny prezentace), jednou měsíčně lze limit překročit. Placené tarify bez limitu publika.",
  },
  {
    label: "Rozsah prezentace",
    us: "Až 30 otázek a 60 slajdů celkem.",
    them: "Až 200 slajdů v prezentaci.",
  },
  {
    label: "Registrace autora",
    us: "Není potřeba – dostanete tajný odkaz na ovládání.",
    them: "Potřeba (bezplatný účet).",
  },
  {
    label: "Registrace účastníka",
    us: "Není potřeba. Volitelně můžete chtít jméno nebo přezdívku.",
    them: "Není potřeba – připojení kódem nebo odkazem.",
  },
  {
    label: "Čeština",
    us: "Celé rozhraní je česky, pro autora i účastníky.",
    them: "Rozhraní pro účastníky lze přepnout do češtiny. Rozhraní pro autora česky není (angličtina, němčina, španělština, portugalština).",
  },
  {
    label: "Typy otázek",
    us: "Výběr jedné ze 2–10 odpovědí, volitelně se správnou odpovědí.",
    them: "Mnoho typů, mj. otevřené otázky, hodnocení a řazení, dotazy publika (Q&A), kvíz.",
  },
  {
    label: "Prezentace",
    us: "Obsahové slajdy s textem a obrázkem, slajdy s výsledky, pozadí prezentace, ovládání klávesnicí.",
    them: "Vlastní editor prezentací; ceník uvádí 23 typů slajdů i na tarifu Free.",
  },
  {
    label: "Kvízy a skóre",
    us: "Body za správnou odpověď, volitelný bonus za rychlost, průběžné pořadí.",
    them: "Kvízové slajdy s pořadím (až 2 000 účastníků).",
  },
];

export default function MentimeterAlternativePage() {
  return (
    <ComparisonShell crumb="Mentimeter">
      <Hero
        title="Česká alternativa k Mentimeteru"
        intro={
          <p>
            Hlasuju.cz se hodí lektorům, učitelům a přednášejícím, kteří chtějí do školení zapojit publikum otázkami, krátkými kvízy a
            výsledky na plátně. Bez zakládání účtu, v češtině a bez měsíčního limitu účastníků.
          </p>
        }
      />

      <Section title="Hlasuju.cz a Mentimeter v kostce">
        <p>
          Mentimeter je rozsáhlý nástroj s desítkami typů slajdů a vlastním editorem prezentací. Hlasuju.cz je jednodušší: umí otázky s
          výběrem odpovědi, obsahové slajdy a kvízy s body. Méně možností, ale také méně nastavování a žádný účet.
        </p>
        <ComparisonTable competitor="Mentimeter" rows={ROWS} caption="Srovnání Hlasuju.cz a Mentimeteru" />
        <p className="mt-3 text-sm text-gray-500">
          „Bez limitu tarifu“ neznamená zaručenou kapacitu pro libovolně velké publikum – u akce pro stovky lidí si hlasování raději předem
          vyzkoušejte.
        </p>
      </Section>

      <Section title="Příklad: dvouhodinové školení první pomoci">
        <p>
          Lektorka chce, aby účastníci během školení opravdu přemýšleli, ne jen poslouchali. Připraví si krátkou prezentaci přímo v
          Hlasuju.cz:
        </p>
        <Steps
          steps={[
            <>
              Na stránce{" "}
              <Link href="/vytvorit" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
                Vytvořit hlasování
              </Link>{" "}
              vloží úvodní obsahový slajd s osnovou a fotkou.
            </>,
            "Přidá otázky typu „Co uděláte jako první?“ s obrázkem situace a označí správnou odpověď.",
            "Za otázky zařadí slajd s výsledky a na konec průběžné pořadí, aby se dalo vyhodnotit, kdo si nejvíc zapamatoval.",
            "Na začátku školení promítne QR kód. Účastníci se připojí mobilem, bez aplikace a registrace.",
            "Klávesou nebo prezentérem posouvá slajdy, výsledky se ukazují živě na plátně.",
          ]}
        />
        <p className="mt-4">
          Když chce školení zopakovat s další skupinou, spustí nové promítání se stejnými otázkami a čistými výsledky.
        </p>
      </Section>

      <Section title="Kdy zvolit Hlasuju.cz">
        <Bullets
          items={[
            "Školíte nebo učíte česky a chcete české rozhraní i pro sebe, nejen pro účastníky.",
            "Nechcete zakládat účet ani hlídat měsíční limit účastníků – školení máte častěji než jednou za měsíc a skupiny bývají větší než pár lidí.",
            "Vystačíte si s otázkami s výběrem odpovědi, krátkými textovými slajdy a kvízem s body.",
            "Chcete začít hned: hlasování je připravené za pár minut a odkaz na ovládání si pošlete e-mailem.",
          ]}
        />
      </Section>

      <Section title="Kdy může být vhodnější Mentimeter">
        <Bullets
          items={[
            "Potřebujete otevřené otázky, hodnocení na škále, řazení nebo dotazy publika (Q&A) – to Hlasuju.cz neumí.",
            "Chcete celou prezentaci tvořit v jednom nástroji a potřebujete víc než 60 slajdů.",
            "Prezentace chcete mít uložené v účtu dlouhodobě a sdílet je v týmu. Hlasování v Hlasuju.cz je dostupné 30 dní.",
            "Vaše organizace vyžaduje přihlášení účastníků přes firemní účet (SSO).",
          ]}
        />
      </Section>

      <Section title="Časté otázky">
        <Faq
          items={[
            {
              q: "Můžu v Hlasuju.cz promítat celou přednášku, nebo jen otázky?",
              a: "Kromě otázek můžete vložit obsahové slajdy s nadpisem, textem, odrážkami a obrázkem, slajdy s výsledky dřívější otázky a průběžné pořadí. Na celou přednášku s grafikou je ale většina lidí zvyklá na PowerPoint nebo Google Slides – Hlasuju.cz pak můžete pustit jen na interaktivní části.",
            },
            {
              q: "Jak se účastníci připojí?",
              a: "Na hlasuju.cz zadají šestimístný kód, naskenují QR kód z plátna nebo otevřou odkaz. Nepotřebují aplikaci ani účet.",
            },
            {
              q: "Co když nemám účet – jak se k hlasování vrátím?",
              a: "Po vytvoření dostanete tajný odkaz na ovládání. Uložte si ho do záložek nebo si ho nechte poslat e-mailem. Kdo odkaz má, může hlasování ovládat, proto ho nesdílejte.",
            },
            {
              q: "Jde u odpovědí poznat, kdo jak hlasoval?",
              a: "Ve výchozím stavu je hlasování anonymní. Při vytváření můžete zapnout jmenovité hlasování – účastníci pak před hlasováním zadají jméno nebo přezdívku a pořadí v kvízu se ukáže se jmény.",
            },
          ]}
        />
      </Section>

      <FinalCta text="Vyzkoušejte interaktivní prezentaci na příštím školení." />

      <Sources
        sources={[
          { label: "Mentimeter – ceník (mentimeter.com/plans)", href: "https://www.mentimeter.com/plans" },
          {
            label: "Mentimeter Help – What is included in the free account",
            href: "https://help.mentimeter.com/en/articles/1258367-what-is-included-in-the-free-account",
          },
          {
            label: "Mentimeter Help – How many people can participate in a Menti",
            href: "https://help.mentimeter.com/en/articles/465589-how-many-people-can-participate-in-a-menti",
          },
          {
            label: "Mentimeter Help – How can I change the language in Mentimeter",
            href: "https://help.mentimeter.com/en/articles/465592-how-can-i-change-the-language-in-mentimeter",
          },
          { label: "Mentimeter – Features (připojení účastníků bez účtu)", href: "https://www.mentimeter.com/features" },
        ]}
      />

      <OtherComparisons current="/alternativa-mentimeter" />
    </ComparisonShell>
  );
}
