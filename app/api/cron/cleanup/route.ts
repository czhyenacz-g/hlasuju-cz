import { NextResponse } from "next/server";
import { runCleanup } from "../../../../lib/maintenance/cleanup.ts";
import { jsonError } from "../../../../lib/http.ts";

/**
 * Denní úklid (vercel.json → crons). Vercel posílá
 * `Authorization: Bearer <CRON_SECRET>`; bez nastaveného CRON_SECRET je
 * endpoint zavřený pro všechny (fail-closed).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError("Cron není nastavený (chybí CRON_SECRET).", 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return jsonError("Neautorizováno.", 401);

  const summary = await runCleanup();
  return NextResponse.json(summary);
}
