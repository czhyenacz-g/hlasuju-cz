import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import { questionMediaColumns, toPublicLink, toQuestionImage, toQuestionLink } from "./question-media.ts";
import type { PublicPollView } from "./types.ts";

/**
 * `null` = poll neexistuje NEBO vypršel (viz zadání "expiraci stačí
 * respektovat při načítání" — WHERE expiresAt > now() přímo v dotazu).
 *
 * Vrací jen to, co účastník smí vidět: nikdy moderatorToken, nikdy
 * připravené (nespuštěné) otázky, jen aktuální otázku. Odkaz u otázky
 * jen po jejím ukončení, nebo když ho moderátor výslovně povolil už
 * během hlasování (může prozradit správnou odpověď). Až přibude
 * správná odpověď patří jen do `closedQuestion`.
 */
export async function getPublicPoll(publicCode: string): Promise<PublicPollView | null> {
  const db = getDb();

  const [poll] = await db
    .select({
      id: polls.id,
      title: polls.title,
      status: polls.status,
      activeQuestionId: polls.activeQuestionId,
      requireParticipantName: polls.requireParticipantName,
    })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return null;

  let activeQuestion: PublicPollView["activeQuestion"] = null;
  let closedQuestion: PublicPollView["closedQuestion"] = null;

  if (poll.activeQuestionId && poll.status === "active") {
    const [question] = await db
      .select({
        id: questions.id,
        text: questions.text,
        status: questions.status,
        correctOptionId: questions.correctOptionId,
        ...questionMediaColumns,
      })
      .from(questions)
      .where(and(eq(questions.id, poll.activeQuestionId), eq(questions.pollId, poll.id)))
      .limit(1);

    const questionOptions = question
      ? await db
          .select({ id: options.id, text: options.text })
          .from(options)
          .where(eq(options.questionId, question.id))
          .orderBy(options.position)
      : [];

    // Správná odpověď (correctOptionId) se do `activeQuestion` nikdy
    // nedostane — ani po znovuotevření otázky. Jen do `closedQuestion`.
    if (question?.status === "active") {

      const link = toQuestionLink(question);
      activeQuestion = {
        id: question.id,
        text: question.text,
        image: toQuestionImage(question),
        link: link?.showDuringVoting ? toPublicLink(link) : null,
        options: questionOptions,
      };
    } else if (question?.status === "ended") {
      closedQuestion = {
        id: question.id,
        text: question.text,
        image: toQuestionImage(question),
        link: toPublicLink(toQuestionLink(question)),
        options: questionOptions,
        correctOptionId: question.correctOptionId,
      };
    }
  }

  return {
    title: poll.title,
    pollStatus: poll.status as PublicPollView["pollStatus"],
    requireParticipantName: poll.requireParticipantName,
    activeQuestion,
    closedQuestion,
  };
}
