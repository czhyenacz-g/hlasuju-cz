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
  "/alternativa-kahoot",
  "Kahoot alternativa v češtině | Hlasuju.cz",
  "Jednoduchý kvíz v češtině: správné odpovědi, body, bonus za rychlost a pořadí účastníků. Srovnání Hlasuju.cz a Kahoot!, bez registrace."
);

const ROWS: ComparisonRow[] = [
  {
    label: "Použití zdarma",
    us: "Zdarma, bez placených tarifů.",
    them: "Pro učitele tarif Kahoot! Go zdarma, placené od 3 USD měsíčně (při ročním placení). Pro firmy zkušební Kahoot! 360 Express zdarma.",
  },
  {
    label: "Hráči zdarma",
    us: "Počet účastníků neomezuje tarif. Server chrání jen limity proti zneužití.",
    them: "Kahoot! Go: stránka tarifů uvádí v tabulce 40 hráčů na hru, v otázkách a odpovědích 10. Kahoot! 360 Express: 15 účastníků a 15 minut.",
  },
  {
    label: "Registrace autora",
    us: "Není potřeba.",
    them: "Potřeba (bezplatný účet).",
  },
  {
    label: "Registrace hráče",
    us: "Není potřeba. Volitelně jméno nebo přezdívka.",
    them: "Není potřeba.",
  },
  {
    label: "Čeština",
    us: "Celé rozhraní je česky.",
    them: "České rozhraní jsme na oficiálních stránkách neověřili.",
  },
  {
    label: "Typy otázek",
    us: "Výběr jedné ze 2–10 odpovědí, k tomu obsahové slajdy s textem a obrázkem.",
    them: "Kahoot! Go: kvíz a pravda/nepravda. Další typy (anketa, otevřená otázka, puzzle…) v placených tarifech.",
  },
  {
    label: "Bodování",
    us: "Pevné body za správnou odpověď (1–100), volitelně bonus +3/+2/+1 pro první tři správné odpovědi.",
    them: "Až 1 000 bodů za otázku, čím rychlejší odpověď, tím víc bodů. Režim přesnosti dává 1 bod za správnou odpověď.",
  },
  {
    label: "Časový limit otázky",
    us: "Volitelně, 3 sekundy až 10 minut. Bez limitu otázku ukončuje moderátor.",
    them: "Ano, 5 sekund až 4 minuty.",
  },
  {
    label: "Pořadí hráčů",
    us: "Slajd s průběžným pořadím kdekoli v prezentaci, na plátně po deseti místech.",
    them: "Ano.",
  },
];

export default function KahootAlternativePage() {
  return (
    <ComparisonShell crumb="Kahoot!">
      <Hero
        title="Česká alternativa ke Kahootu pro jednoduché kvízy"
        intro={
          <p>
            Hlasuju.cz zvládne krátký kvíz do hodiny nebo na teambuilding: označíte správné odpovědi, účastníci sbírají body a na plátně
            ukážete pořadí. Bez účtu, v češtině a bez limitu hráčů v tarifu.
          </p>
        }
      />

      <Section title="Kvíz, kde čas jen pomáhá">
        <p>
          Kahoot! je postavený na rychlosti: otázka má odpočet a body klesají s každou vteřinou. Hlasuju.cz je klidnější. Body dostane
          každý, kdo odpověděl správně, a otázku můžete ukončit, až když odpoví všichni. Kdo chce soutěživost, nastaví u otázky odpočet
          (např. 10 sekund – pak už se odpovědi nepřijímají) nebo zapne bonus za rychlost: první tři správné odpovědi dostanou navíc 3, 2
          a 1 bod.
        </p>
        <ComparisonTable competitor="Kahoot!" rows={ROWS} caption="Srovnání Hlasuju.cz a Kahoot!" />
      </Section>

      <Section title="Příklad: opakování v hodině zeměpisu">
        <p>Učitel chce na konci hodiny zopakovat hlavní města Evropy a zjistit, co třídě ještě nejde.</p>
        <Steps
          steps={[
            <>
              Na stránce{" "}
              <Link href="/vytvorit" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
                Vytvořit hlasování
              </Link>{" "}
              zapne jmenovité hlasování a připraví deset otázek. U každé označí správnou odpověď, k některým přidá mapu.
            </>,
            "U posledních tří otázek zapne bonus za rychlost, aby byl závěr napínavější.",
            "Za pátou otázku vloží průběžné pořadí, na konec konečné.",
            "Žáci se připojí kódem z tabule, zadají přezdívku a hrají na svých telefonech.",
            "Po každé otázce ukáže výsledky se správnou odpovědí – hned je vidět, co třída neví, a dá se k tomu vrátit.",
          ]}
        />
      </Section>

      <Section title="Kdy zvolit Hlasuju.cz">
        <Bullets
          items={[
            "Máte ve třídě nebo na akci víc hráčů, než dovoluje bezplatný tarif Kahootu.",
            "Nechcete zakládat účet a kvíz potřebujete jednorázově – na školení, večírek nebo táborový program.",
            "Chcete kvíz, kde rozhoduje hlavně správnost – odpočet a bonus za rychlost zapnete jen u otázek, kde se hodí.",
            "Potřebujete mezi otázky vložit vysvětlující slajd s textem a obrázkem.",
          ]}
        />
      </Section>

      <Section title="Kdy může být vhodnější Kahoot!">
        <Bullets
          items={[
            "Chcete opravdovou hru, kde body plynule klesají s každou vteřinou odpovědi.",
            "Potřebujete jiné typy otázek: víc správných odpovědí, puzzle nebo otevřenou odpověď (část z nich jen v placených tarifech).",
            "Chcete zadávat kvízy jako domácí úkol, který žáci plní každý svým tempem. Hlasuju.cz počítá s živým kvízem s moderátorem.",
          ]}
        />
      </Section>

      <Section title="Časté otázky">
        <Faq
          items={[
            {
              q: "Jak se počítají body?",
              a: "Každá otázka se správnou odpovědí má body (výchozí 1, můžete nastavit až 100). Kdo odpoví správně, body dostane, za špatnou odpověď se nic neodečítá. S bonusem za rychlost dostanou první tři správné odpovědi navíc 3, 2 a 1 bod – pořadí určuje čas přijetí hlasu na serveru, ne hodiny v telefonu.",
            },
            {
              q: "Uvidí hráči své pořadí?",
              a: "Pořadí se ukazuje na plátně na slajdu s průběžným pořadím, který si vložíte, kam chcete. U jmenovitého hlasování se zobrazí přezdívky, jinak se účastníci jen očíslují.",
            },
            {
              q: "Je otázka omezená časem?",
              a: "Jen když chcete. U otázky nastavíte odpočet v sekundách (3 s až 10 min). Odpočet běží na plátně i v telefonech a po jeho konci server další odpovědi nepřijme. Bez odpočtu otázku ukončíte sami tlačítkem nebo klávesou.",
            },
            {
              q: "Můžu kvíz zopakovat s jinou třídou?",
              a: "Ano. Spustíte nové promítání se stejnými otázkami a novými výsledky, nebo před ostrým během vynulujete zkušební odpovědi.",
            },
          ]}
        />
      </Section>

      <FinalCta text="Připravte kvíz na příští hodinu." />

      <Sources
        sources={[
          { label: "Kahoot! – tarify pro školy (kahoot.com/schools/plans)", href: "https://kahoot.com/schools/plans/" },
          { label: "Kahoot! 360 – ceník pro firmy (kahoot360.com/pricing)", href: "https://kahoot360.com/pricing/" },
          { label: "Kahoot! Support – How points work", href: "https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work" },
          { label: "Kahoot! Support – Kahoot! question types", href: "https://support.kahoot.com/hc/en-us/articles/115002308428-Kahoot-question-types" },
        ]}
      />

      <OtherComparisons current="/alternativa-kahoot" />
    </ComparisonShell>
  );
}
