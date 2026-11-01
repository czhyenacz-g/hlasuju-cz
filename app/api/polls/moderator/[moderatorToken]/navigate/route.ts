import { NextResponse } from "next/server";
import { navigateSlide } from "../../../../../../lib/polls/navigate-slide.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { jsonError, readJsonBody } from "../../../../../../lib/http.ts";

const REASON: Record<string, [string, number]> = {
  poll_not_found: ["Hlasování nenalezeno.", 404],
  poll_closed: ["Hlasování už bylo ukončeno.", 409],
  not_live: ["Anketa pro web nemá promítání.", 409],
  slide_not_found: ["Slajd už neexistuje. Načtěte stránku znovu.", 400],
};

function isSlideId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Přechod na slajd v promítání (viz lib/polls/navigate-slide.ts). */
export async function POST(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_SMALL_BODY_BYTES);
  if (!body.ok) return body.response;

  const { fromSlideId, toSlideId } = (body.value ?? {}) as Record<string, unknown>;
  if (!isSlideId(toSlideId) || (fromSlideId !== null && !isSlideId(fromSlideId))) {
    return jsonError("Neplatný požadavek.", 400);
  }

  const result = await navigateSlide(moderatorToken, fromSlideId, toSlideId);
  if (!result.ok) {
    if (result.reason === "stale") {
      // Mezitím se přepnulo jinde (druhé okno, dvojklik) — klient si načte stav.
      return jsonError("Prezentace se mezitím posunula jinde. Zobrazuji aktuální slajd.", 409, {
        code: "stale",
        activeSlideId: result.activeSlideId,
      });
    }
    const [message, status] = REASON[result.reason];
    return jsonError(message, status);
  }

  return NextResponse.json({ ok: true, activeSlideId: result.activeSlideId, changed: result.changed });
}
