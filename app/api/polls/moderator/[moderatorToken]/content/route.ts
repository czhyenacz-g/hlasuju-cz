import { NextResponse } from "next/server";
import { findPollByModeratorToken } from "../../../../../../lib/polls/find-poll.ts";
import { getEditorContent } from "../../../../../../lib/polls/get-editor-content.ts";
import { LIMITS } from "../../../../../../lib/polls/limits.ts";
import { updatePollContent } from "../../../../../../lib/polls/update-poll-content.ts";
import { validateUpdatePollInput } from "../../../../../../lib/polls/validate.ts";
import { jsonError, readJsonBody, tooManyRequests } from "../../../../../../lib/http.ts";
import { checkRateLimits, RATE_LIMITS, rule } from "../../../../../../lib/rate-limit.ts";

type Params = { params: Promise<{ moderatorToken: string }> };

/** Obsah hlasování pro editor (jen s moderátorským tokenem). */
export async function GET(_request: Request, { params }: Params) {
  const { moderatorToken } = await params;
  const content = await getEditorContent(moderatorToken);
  if (!content) return jsonError("Hlasování nenalezeno.", 404);
  return NextResponse.json(content);
}

/** Uložení celého obsahu z editoru (viz lib/polls/update-poll-content.ts). */
export async function PUT(request: Request, { params }: Params) {
  const { moderatorToken } = await params;

  const body = await readJsonBody(request, LIMITS.MAX_CONTENT_BODY_BYTES);
  if (!body.ok) return body.response;

  const validated = validateUpdatePollInput(body.value);
  if (!validated.ok) return jsonError(validated.error, 400);

  const poll = await findPollByModeratorToken(moderatorToken);
  if (!poll) return jsonError("Hlasování nenalezeno.", 404);

  const limited = await checkRateLimits([rule("content-save", String(poll.id), RATE_LIMITS.contentSavePerPoll)]);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSeconds);

  const result = await updatePollContent(moderatorToken, validated.value);
  if (!result.ok) {
    switch (result.reason) {
      case "poll_not_found":
        return jsonError("Hlasování nenalezeno.", 404);
      case "poll_closed":
        return jsonError("Hlasování je ukončené, otázky už nelze upravovat.", 409, { code: "poll_closed" });
      case "version_conflict":
        return jsonError(
          "Hlasování mezitím někdo upravil (třeba v jiném okně). Načtěte prosím aktuální verzi — vaše neuložené změny by jinak přepsaly novější obsah.",
          409,
          { code: "version_conflict", currentVersion: result.currentVersion }
        );
      case "invalid_change":
        return jsonError(result.message, 409, { code: "invalid_change" });
    }
  }

  const content = await getEditorContent(moderatorToken);
  return NextResponse.json(content);
}
