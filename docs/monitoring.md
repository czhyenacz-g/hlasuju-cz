# Monitoring dostupnosti

Jednoduchý externí monitoring: zjistí nedostupný web nebo nefunkční
spojení s databází a pošle e-mail při výpadku a při obnovení. Nejde
o detekci útoků ani o kontrolu volného místa — úspěšný dotaz na DB
nepotvrzuje funkčnost všech operací aplikace.

## Provozní endpoint

```
GET https://hlasuju.cz/api/ops/e273f28d52523a8d
Authorization: Bearer <OPS_MONITOR_TOKEN>
```

- Kód: `app/api/ops/e273f28d52523a8d/route.ts`, `lib/ops/*`.
- Bez platného tokenu (chybí, špatný, v URL místo hlavičky, nebo není
  nastavený `OPS_MONITOR_TOKEN` na serveru) → **404**, databáze se
  nekontroluje.
- S tokenem: `select 1` s timeoutem 3 s → **200** `{"status":"ok"}`,
  při chybě nebo timeoutu **503** `{"status":"error"}`. Žádné
  podrobnosti chyb, `Cache-Control: no-store`.
- Token je jen v serverovém prostředí Vercelu (`OPS_MONITOR_TOKEN`,
  Production, sensitive) a v nastavení monitoru. Nikdy ne v repozitáři,
  klientském kódu, URL ani logu.

## Externí kontroly

| Kontrola | Požadavek | Očekávaný výsledek |
| --- | --- | --- |
| Web | `GET https://hlasuju.cz/` | HTTP 200 a text „Hlasování, které zapojí každého.“ |
| Databáze | `GET …/api/ops/e273f28d52523a8d` + hlavička `Authorization` | HTTP 200 a text `"status":"ok"` |

Pravidla upozornění: alarm až po potvrzení opakovanou kontrolou, jeden
e-mail při vzniku výpadku a jeden při obnovení (ne každou minutu).

**Služba, interval a příjemce:** viz sekce „Stav“ níže (doplní se po
zapojení monitoru).

## Stav

- [ ] Monitor zapojený (služba, interval): zatím ne — externí služba se zatím neřeší
- [x] Příjemce upozornění: hynek@darbujan.com
- [ ] Ověřeno doručení e-mailu o výpadku i o obnovení:

## Výměna tokenu

1. Vygenerovat nový token (min. 32 znaků), např.
   `python3 -c "import secrets;print(secrets.token_urlsafe(36), end='')" > ~/.config/hlasuju-cz/ops-monitor-token`
   (soubor `chmod 600`, obsah nevypisovat).
2. Na Vercelu nahradit proměnnou:
   `npx vercel env rm OPS_MONITOR_TOKEN production --yes` a
   `npx vercel env add OPS_MONITOR_TOKEN production --sensitive < ~/.config/hlasuju-cz/ops-monitor-token`.
3. Spustit nový produkční deploy (proměnné se načítají při deployi).
4. V monitoru přepsat hodnotu hlavičky `Authorization: Bearer <nový token>`.
5. Ověřit, že kontrola databáze je zelená.

Mezi kroky 3 a 4 může monitor krátce hlásit výpadek kontroly databáze —
pro plynulou výměnu nejdřív změnit token v monitoru těsně před deployem,
nebo upozornění dočasně pozastavit.

## Změna cesty endpointu

Cesta není tajná (tajný je token). Pokud ji přesto chcete změnit,
přejmenujte složku `app/api/ops/<id>` a upravte URL v monitoru.
