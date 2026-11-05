import { checkDatabase } from "../../../../lib/ops/check-database.ts";
import { isMonitorAuthorized } from "../../../../lib/ops/monitor-auth.ts";

/**
 * Provozní kontrola pro externí monitoring (docs/monitoring.md).
 * Náhodná cesta + tajný token v hlavičce. Bez platného tokenu 404 a
 * databáze se nekontroluje; s tokenem malý dotaz na DB → 200 / 503.
 * Žádné podrobnosti chyb, nic se necachuje.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  if (!isMonitorAuthorized(request)) {
    return new Response("Not Found", { status: 404, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const ok = await checkDatabase();
  return Response.json({ status: ok ? "ok" : "error" }, { status: ok ? 200 : 503, headers: NO_STORE });
}
