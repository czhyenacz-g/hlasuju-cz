import "server-only";
import { randomBytes, randomInt } from "node:crypto";

/**
 * Veřejný kód pro účastníky — 6místné číslo (100000–999999), krátké a
 * dobře opisovatelné/diktovatelné (viz zadání). Kolize se řeší v
 * create-poll.ts (retry na unique constraint), NENÍ to autentizace.
 */
export function generatePublicCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Moderátorský token — kryptograficky náhodný, dost dlouhý na to, aby
 * ho nešlo realisticky uhodnout (32 bajtů = 256 bitů entropie, viz
 * zadání). URL-safe base64, žádné dash-formátování navíc (token se
 * neopisuje ručně, jen se klikne/otevře z e-mailu/záložky).
 */
export function generateModeratorToken(): string {
  return randomBytes(32).toString("base64url");
}
