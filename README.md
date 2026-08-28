# hlasuju.cz

Jednoduchá webová appka pro živé hlasování během prezentací, školení a
porad. Moderátor založí hlasování bez registrace, sdílí krátký kód nebo
QR kód, spouští otázky a promítá výsledky. Účastníci se připojí přes
`hlasuju.cz/KOD`, žádný účet, žádné heslo.

Žádné WebSockets — účastnická i moderátorská stránka si stav prostě
pravidelně stahují (polling každé ~2,5 s). Hlasování automaticky
"vyprší" 30 dní po vytvoření (respektuje se při čtení, nic se fyzicky
nemaže).

## Jak to funguje

- **Moderátor** vytvoří hlasování na `/vytvorit` → dostane veřejný kód
  (např. `381742`) a tajný moderátorský odkaz (`/m/<token>`).
- Moderátorský token je dlouhý, kryptograficky náhodný řetězec — je to
  jediná "autentizace" moderátora (capability URL), nikdy se neposílá
  do žádné veřejné/účastnické odpovědi.
- **Účastník** otevře `hlasuju.cz/<kod>` (ručně, nebo přes QR), počká
  na aktivovanou otázku, klikne na odpověď.
- Ochrana proti dvojímu hlasování: náhodné ID uloženo v `localStorage`
  účastníka + unikátní DB constraint `(question_id, participant_id)`.
  Není to neprůstřelný volební systém, jen ochrana proti běžnému
  dvojímu kliknutí.

## Lokální spuštění

```bash
npm install
cp .env.example .env.local   # doplň DATABASE_URL, viz níže
npm run db:migrate
npm run dev
# → http://localhost:3000
```

## Databáze

Appka používá Postgres přes [Drizzle ORM](https://orm.drizzle.team).
Doporučeno [Neon](https://neon.tech) (serverless Postgres, zdarma pro
malé projekty, funguje bez problému na Vercelu):

1. Založ projekt na neon.tech, vytvoř databázi.
2. Zkopíruj **pooled** connection string (obsahuje `-pooler` v hostu) do
   `DATABASE_URL`.
3. Zkopíruj **přímý** (ne pooled) connection string do
   `DATABASE_URL_UNPOOLED` — používají ho jen migrace.
4. Spusť `npm run db:migrate` (vytvoří tabulky).

Schéma je ve `db/schema.ts` (4 tabulky: `polls`, `questions`, `options`,
`votes`). Novou migraci po změně schématu vygeneruješ přes
`npm run db:generate`, aplikuješ přes `npm run db:migrate`.

## Resend (e-mail s odkazem na hlasování)

Volitelné. Po vytvoření hlasování se, pokud moderátor zadal e-mail,
pošle zpráva s kódem a oběma odkazy přes [Resend](https://resend.com).

1. Založ účet na resend.com, vygeneruj API klíč.
2. Nastav `RESEND_API_KEY` (a volitelně `RESEND_FROM_EMAIL`, jinak se
   použije sdílená testovací adresa `onboarding@resend.dev`).

Bez `RESEND_API_KEY` appka funguje úplně normálně — vytvoření hlasování
nikdy nezávisí na tom, jestli se e-mail povedlo poslat.

## Deployment na Vercel

1. Pushni repo na GitHub, naimportuj ho na [vercel.com](https://vercel.com).
2. V Project Settings → Environment Variables nastav `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, volitelně `RESEND_API_KEY` a
   `RESEND_FROM_EMAIL`.
3. Migrace nejsou součástí buildu — spusť `npm run db:migrate` ručně
   (lokálně, s produkční `DATABASE_URL_UNPOOLED` v prostředí) před
   prvním nasazením, případně po každé změně schématu.
4. Deploy proběhne automaticky při pushi do `main`.

## Limity (MVP)

- 30 otázek na hlasování, 2–10 odpovědí na otázku.
- Otázka max 300 znaků, odpověď max 150 znaků.
- Jedna otázka aktivní najednou, jedna volba na hlas.
- Hlasování vyprší 30 dní po vytvoření.
