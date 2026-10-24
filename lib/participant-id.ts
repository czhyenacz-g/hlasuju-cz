const STORAGE_KEY = "hlasuju_participant_id";

/**
 * Náhodné ID účastníka uložené v localStorage — žádná registrace,
 * žádný účet (viz zadání). Persistentní napříč reloady/hlasováními na
 * stejném zařízení/prohlížeči, což je záměr: stejné zařízení = stejný
 * "hlas" i kdyby se stránka omylem obnovila.
 */
export function getOrCreateParticipantId(): string {
  if (typeof window === "undefined") return "";

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage nedostupné (privátní režim apod.) — degradovaný
    // fallback: ID platné jen pro tenhle jeden page-load, ochrana proti
    // dvojitému hlasování se pak spoléhá čistě na to, že uživatel
    // stránku znovu nenačte. Lepší než hlasování úplně shodit.
    return crypto.randomUUID();
  }
}

/**
 * Jako getOrCreateParticipantId, ale vrátí null, když prohlížeč úložiště
 * neumožňuje (typicky widget v cizím iframe s blokovaným úložištěm třetích
 * stran). Veřejná anketa pak hlasování v okně nenabídne — jinak by každé
 * načtení stránky znamenalo nové ID a možnost hlasovat znovu.
 */
export function getPersistentParticipantId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = getOrCreateParticipantId();
    return window.localStorage.getItem(STORAGE_KEY) === id ? id : null;
  } catch {
    return null;
  }
}
