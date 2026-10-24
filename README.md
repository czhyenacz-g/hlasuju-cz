# hlasuju.cz

Jednoduchá webová appka pro živé hlasování během prezentací, školení a
porad. Moderátor založí hlasování bez registrace, sdílí krátký kód nebo
QR kód, spouští otázky a promítá výsledky. Účastníci se připojí přes
`hlasuju.cz/KOD`, žádný účet, žádné heslo.

Žádné WebSockets — účastnická i moderátorská stránka si stav prostě
pravidelně stahují (polling každé ~2,5 s; veřejný stav má 1s CDN cache,
takže stovky účastníků jedné přednášky = ~1 dotaz za sekundu do DB).
Hlasování automaticky "vyprší" 30 dní po vytvoření (respektuje se při
čtení, data v DB se nemažou; obrázky maže denní cron).

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
- **Otázka má stavy** `prepared → active → ended`. Moderátor ji spustí,
  ukončí ("vyhodnocení" — účastníci vidí odkaz, hlasovat už nejde) a pak
  spustí další. Ukončenou otázku jde s potvrzením znovu otevřít (hlasy
  zůstávají). Účastníci nikdy nevidí nespuštěné otázky; finální výsledky
  (`/final-results`) jsou veřejné až po ukončení celého hlasování.
- **Editace** (`/m/<token>/upravit`): nespuštěné otázky jde měnit, přidávat,
  mazat a přeřazovat i během prezentace; spuštěné otázky (nebo s hlasy) jde
  jen přeřadit. Ukončené hlasování je uzamčené. Souběžné úpravy ve dvou
  oknech chrání `polls.version` (starší verze se odmítne, nic se tiše
  nepřepíše).
- **Obrázky** u otázek (JPEG/PNG/WebP; GIF se převede na statický
  obrázek; SVG nikdy; max. 4 MB po zmenšení v prohlížeči) jsou v
  Universal Content API (`content-api.darbujan.com`), v DB je jen URL +
  evidence uploadů (`poll_images`). Prohlížeč nahrává na náš endpoint
  s moderátorským tokenem, server teprve pak posílá soubor do Content API
  — API token nikdy neodchází do prohlížeče. Nové hlasování se proto
  nejdřív vytvoří a editor obrázky nahraje hned potom.
- **Odkaz** u otázky (jen http/https) se studentům ukáže až po ukončení
  otázky, pokud ho moderátor výslovně nepovolí už během hlasování.
- **Promítání** (`▶ Promítat` v konzoli): celá obrazovka, ovládání
  klávesnicí/prezentérem — mezerník = další krok, ←/→ (PageUp/PageDown)
  = otázky, R = výsledky, Q = QR kód, F = celá obrazovka, Esc = zpět.

## Ankety pro web (veřejné ankety a widget)

Druhý režim hlasování (`polls.mode = "self_service"`, výchozí a všechna
historická hlasování jsou `"live"`). Vytváří se na `/pro-weby/vytvorit`.

- **Jedna otázka, 2–10 odpovědí**, hlasuje se hned po vytvoření (otázka je
  od začátku `active`) přes stejný endpoint, identitu účastníka a ochranu
  jako živé hlasování. Moderátor anketu jen ukončí (spouštění/ukončování
  otázek API odmítne).
- **Úprava** jen do prvního hlasu (pak je otázka zamčená). Editace zamyká
  řádky odpovědí (`FOR UPDATE`), takže souběžný hlas buď otázku zamkne,
  nebo dorazí až po uložení (hlas pro smazanou odpověď skončí chybou 400).
- **Výsledky** (`/api/polls/public/<kód>/final-results`) vidí jen ten, kdo
  už hlasoval (nebo všichni po ukončení). **Pravidlo pro správnou odpověď:**
  během hlasování se neprozradí nikomu (ani hlasujícímu, ani v Open Graph
  náhledu) — zobrazí se všem až po ukončení ankety moderátorem.
- **Platnost** 30 dní od posledního hlasu (zápis do DB nejvýš jednou denně).
- **Stránka** `/<kód>` má vlastní Open Graph (otázka, výzva, obrázek
  `/og/<kód>?v=<verze>` 1200×630 bez výsledků a správné odpovědi) a je
  `noindex` (Facebook náhled načte i tak). Živá hlasování mají dál obecná
  metadata — jejich otázky jsou před spuštěním tajné.
- **Widget** `/embed/<kód>` (iframe): jediná route, kterou smí cizí web
  vložit (`frame-ancestors *`); všechny ostatní stránky mají
  `X-Frame-Options: DENY` + `frame-ancestors 'none'` (next.config.ts).
  Bez navigace, banneru a analytiky. Když prohlížeč v iframe blokuje
  úložiště třetích stran, widget hlasování nenabídne a odkáže na
  hlasuju.cz (jinak by každé načtení = nové ID = další hlas).
- **Sdílení**: obyčejné URL (Facebook sharer, WhatsApp, e-mail, Web Share
  API na mobilu, kopírování). Žádné Graph API.

**Limity ochrany (záměrně jednoduchá):** jeden hlas na prohlížeč (ID v
localStorage) + DB unique (otázka, účastník) + nejvýš 30 hlasů za hodinu
z jedné IP do jedné ankety. Kdo smaže data prohlížeče, použije anonymní
okno nebo jiné zařízení/síť, může hlasovat znovu; úložiště ve widgetu je
oddělené podle webu, kam je vložený. Výsledky jsou orientační, ne
reprezentativní průzkum (uvedeno i v UI). Kódy jsou 6místné — kdo zkouší
kódy, najde jen veřejné otázky a hlasovat může; výsledky bez hlasu neuvidí.

## Ochrana proti zneužití

- Rate limiting je v Postgresu (tabulka `rate_limits`, fixní okna,
  `lib/rate-limit.ts`) — funguje napříč serverless instancemi, žádná další
  služba. Limity jsou velkorysé kvůli školám za jednou IP (600 hlasů/min
  z jedné IP do jednoho hlasování, 30/min na jeden prohlížeč, 10 nových
  hlasování / 10 min a 60 / den z IP, 60 uploadů / h na hlasování).
  Při výpadku vrstvy limitů se požadavek pustí (fail-open).
- Limity velikosti těla požadavků, honeypot pole ve formuláři.
- Neplatné URL hlasování vrací skutečné HTTP 404.

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

Schéma je ve `db/schema.ts` (5 tabulek: `polls`, `questions`, `options`,
`votes`, `rate_limits`). Novou migraci po změně schématu vygeneruješ přes
`npm run db:generate`, aplikuješ přes `npm run db:migrate`.

## Resend (e-maily)

Volitelné. Dva e-maily, oba jen na adresu, kterou moderátor zadal při
vytvoření (`lib/email/`):

- **Po vytvoření hlasování** (automaticky, přes `after()`): kód, odkaz
  pro účastníky, moderátorský odkaz a krátký návod.
- **Výsledky** (tlačítko „Poslat výsledky e-mailem" po ukončení,
  `POST /api/polls/moderator/<token>/results-email`): počty, procenta,
  počet účastníků a CSV v příloze. Příjemce nejde zadat; max. 3×
  na hlasování a nejdřív po 10 minutách (`lib/polls/send-results-email.ts`).

1. Založ účet na resend.com, ověř odesílací doménu (DNS záznamy
   SPF/DKIM pro `hlasuju.cz`) a vygeneruj API klíč (stačí „Sending access").
2. Nastav `RESEND_API_KEY` a `RESEND_FROM_EMAIL`, např.
   `Hlasuju.cz <hlasovani@hlasuju.cz>`. Bez ověřené domény funguje jen
   testovací `onboarding@resend.dev`, která doručí **jen na e-mail
   vlastníka Resend účtu** — skutečným moderátorům ne.

Bez `RESEND_API_KEY` appka funguje úplně normálně — vytvoření hlasování
nikdy nezávisí na e-mailu a tlačítko výsledků ukáže, že odesílání není
dostupné. Úspěch znamená jen, že Resend e-mail přijal, ne že dorazil.

## Obrázky (Universal Content API) — volitelné

1. V adminu Content API (Filament) založit projekt **`hlasuju`**
   s výchozí viditelností **public** (bez kolekcí, bez AI moderace).
2. Vytvořit API token projektu se scopy **`media:upload`** a
   **`media:delete`** (nic dalšího). Plain token se ukáže jen jednou.
3. Ve Vercelu nastavit `CONTENT_API_TOKEN` (Production + Preview);
   `CONTENT_API_URL` / `CONTENT_API_PROJECT` jen pokud se liší od
   výchozích. Redeploy (`/vytvorit` je statická stránka).
4. Bez tokenu appka funguje, editor jen ukáže, že nahrávání obrázků není
   zapnuté, a upload API vrací 503.

Výpadek Content API: upload vrací 502 (editor ukáže chybu, text otázek
jde uložit bez obrázku), rate limit Content API → editor sám počká a
zkusí to znovu. Účastník místo nenačteného obrázku vidí krátkou hlášku,
hlasování běží dál.

## Denní úklid (cron)

`vercel.json` spouští `GET /api/cron/cleanup` jednou denně (03:30 UTC):
maže v Content API (podle evidence `poll_images`, max. 8 souborů za běh
kvůli rate limitu Content API) osiřelé obrázky (nahrané, ale neuložené
déle než 24 h), obrázky hlasování
vypršelých před > 7 dny a staré řádky `rate_limits`. Vyžaduje
`CRON_SECRET` (libovolný dlouhý náhodný řetězec v env proměnných);
bez něj endpoint nic neudělá.

## Testy

`npm test` — unit + integrační testy nad in-memory Postgresem (PGlite,
všechny migrace), volají přímo route handlery; Content API nahrazuje
lokální mock server (`test/helpers/content-api-mock.ts`). Žádná externí
DB ani služba
není potřeba.

## Deployment na Vercel

1. Pushni repo na GitHub, naimportuj ho na [vercel.com](https://vercel.com).
2. V Project Settings → Environment Variables nastav `DATABASE_URL`,
   `DATABASE_URL_UNPOOLED`, `CRON_SECRET`, volitelně `RESEND_API_KEY` a
   `RESEND_FROM_EMAIL` a `CONTENT_API_TOKEN` (viz Obrázky výše).
3. Migrace nejsou součástí buildu — spusť `npm run db:migrate` ručně
   (lokálně, s produkční `DATABASE_URL_UNPOOLED` v prostředí) před
   prvním nasazením, případně po každé změně schématu.
4. Deploy proběhne automaticky při pushi do `master`.

## Limity (MVP)

- 30 otázek na hlasování, 2–10 odpovědí na otázku.
- Otázka max 300 znaků, odpověď max 150 znaků.
- Jedna otázka aktivní najednou, jedna volba na hlas.
- Hlasování vyprší 30 dní po vytvoření.
