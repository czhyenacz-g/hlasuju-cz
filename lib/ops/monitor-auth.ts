import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Token externího monitoringu (OPS_MONITOR_TOKEN, jen serverové prostředí).
 * Posílá se v hlavičce `Authorization: Bearer …`, nikdy v URL. Porovnání
 * v konstantním čase (hash obou stran = stejná délka). Bez nastaveného
 * tokenu je endpoint zavřený pro všechny (fail-closed).
 */
export function isMonitorAuthorized(request: Request): boolean {
  const token = process.env.OPS_MONITOR_TOKEN;
  if (!token || token.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const actual = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, actual);
}
