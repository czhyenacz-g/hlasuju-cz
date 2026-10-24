import { NextResponse } from "next/server";
import { storeQuestionImage } from "../../../../../../lib/images/store-question-image.ts";
import { isImageStorageConfigured } from "../../../../../../lib/images/storage.ts";
import { findPollByModeratorToken } from "../../../../../../lib/polls/find-poll.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { getClientIp, jsonError, tooManyRequests } from "../../../../../../lib/http.ts";
import { checkRateLimits, hashIdentifier, RATE_LIMITS, rule } from "../../../../../../lib/rate-limit.ts";

// Rezerva na multipart obálku kolem samotného souboru.
const MAX_REQUEST_BYTES = LIMITS.MAX_IMAGE_BYTES + 64 * 1024;
const MAX_MB = LIMITS.MAX_IMAGE_BYTES / (1024 * 1024);

/**
 * Nahrání obrázku k otázce. Jen s platným moderátorským tokenem
 * nevypršelého a neukončeného hlasování — anonymní návštěvník bez tokenu
 * nahrát nic nemůže a i s tokenem je upload omezený rate limitem.
 * Vrací URL a rozměry; k otázce se obrázek přiřadí až uložením obsahu.
 */
export async function POST(request: Request, { params }: { params: Promise<{ moderatorToken: string }> }) {
  const { moderatorToken } = await params;

  if (!isImageStorageConfigured()) {
    return jsonError("Nahrávání obrázků zatím není na serveru nastavené.", 503, { code: "storage_not_configured" });
  }

  const poll = await findPollByModeratorToken(moderatorToken);
  if (!poll) return jsonError("Hlasování nenalezeno.", 404);
  if (poll.status !== "active") return jsonError("Hlasování je ukončené, obrázky už nelze měnit.", 409);

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return jsonError(`Obrázek je příliš velký (max. ${MAX_MB} MB).`, 413);
  }

  const limited = await checkRateLimits([
    rule("upload-poll", String(poll.id), RATE_LIMITS.uploadPerPoll),
    rule("upload-ip-day", hashIdentifier(getClientIp(request)), RATE_LIMITS.uploadPerIpDaily),
  ]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError("Neplatný požadavek.", 400);
  }
  if (!file || typeof file === "string") return jsonError("Chybí soubor s obrázkem.", 400);
  if (file.size > LIMITS.MAX_IMAGE_BYTES) return jsonError(`Obrázek je příliš velký (max. ${MAX_MB} MB).`, 413);

  const result = await storeQuestionImage(poll.id, new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) {
    switch (result.reason) {
      case "storage_not_configured":
        return jsonError("Nahrávání obrázků zatím není na serveru nastavené.", 503, { code: "storage_not_configured" });
      case "storage_busy": {
        // Limit Content API je sdílený pro celé Hlasuju — editor počká a zkusí to znovu.
        const retryAfter = Math.min(result.retryAfterSeconds ?? 60, 120);
        return jsonError(
          "Úložiště obrázků je teď vytížené, zkuste to za chvíli.",
          503,
          { code: "storage_busy", retryAfter },
          { "Retry-After": String(retryAfter) }
        );
      }
      case "storage_unavailable":
        return jsonError(
          "Úložiště obrázků je teď nedostupné. Otázky můžete uložit bez obrázku a obrázek přidat později.",
          502,
          { code: "storage_unavailable" }
        );
      case "too_large":
        return jsonError(`Obrázek je příliš velký (max. ${MAX_MB} MB).`, 413);
      case "too_many_pixels":
        return jsonError(`Obrázek má příliš velké rozměry (max. ${LIMITS.MAX_IMAGE_DIMENSION} px na stranu).`, 400);
      case "unsupported":
        return jsonError("Soubor není platný obrázek. Povolené formáty: JPEG, PNG, WebP.", 415);
    }
  }

  return NextResponse.json(result.image, { status: 201 });
}
