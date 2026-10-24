import "server-only";
import { after, NextResponse } from "next/server";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>, headers?: HeadersInit) {
  return NextResponse.json({ error: message, ...extra }, { status, headers });
}

export function tooManyRequests(retryAfterSeconds: number) {
  return jsonError("Příliš mnoho požadavků. Zkuste to prosím za chvíli.", 429, undefined, {
    "Retry-After": String(retryAfterSeconds),
  });
}

/**
 * Přečte JSON tělo s horní mezí velikosti — nejdřív podle Content-Length
 * (levné odmítnutí bez čtení), pak skutečně podle přečtených bajtů
 * (Content-Length může chybět nebo lhát).
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: jsonError("Požadavek je příliš velký.", 413) };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: jsonError("Neplatný požadavek.", 400) };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, response: jsonError("Požadavek je příliš velký.", 413) };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonError("Neplatný JSON.", 400) };
  }
}

/**
 * IP klienta pro rate limiting. Na Vercelu x-forwarded-for nastavuje
 * (a přepisuje) samotná platforma, první položka je skutečný klient.
 * Lokálně/bez proxy fallback "unknown" — limit pak sdílí všichni, což
 * je v dev v pořádku.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Spustí úlohu až po odeslání odpovědi, ale tak, aby ji serverless
 * runtime neukončil předčasně (Next.js `after`). Mimo request scope
 * (testy) prostě spustí úlohu na pozadí.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
