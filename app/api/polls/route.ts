import { NextRequest, NextResponse } from "next/server";
import { createPoll } from "../../../lib/polls/create-poll.ts";
import { validateCreatePollInput } from "../../../lib/polls/validate.ts";
import { sendPollCreatedEmail } from "../../../lib/email/send-poll-created-email.ts";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const validated = validateCreatePollInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { publicCode, moderatorToken } = await createPoll(validated.value);

  // Fire-and-forget, fail-open — e-mail je bonus (viz zadání), nikdy
  // nesmí zdržet ani shodit odpověď na vytvoření hlasování.
  if (validated.value.email) {
    void sendPollCreatedEmail({
      to: validated.value.email,
      title: validated.value.title ?? null,
      publicCode,
      moderatorToken,
    });
  }

  return NextResponse.json({ publicCode, moderatorToken }, { status: 201 });
}
