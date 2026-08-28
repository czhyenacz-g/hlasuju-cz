import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import type { PublicPollView } from "./types.ts";

/**
 * `null` = poll neexistuje NEBO vypršel (viz zadání "expiraci stačí
 * respektovat při načítání" — WHERE expiresAt > now() přímo v dotazu).
 * Vrací jen to, co účastník smí vidět — nikdy moderatorToken.
 */
export async function getPublicPoll(publicCode: string): Promise<PublicPollView | null> {
  const db = getDb();

  const [poll] = await db
    .select({
      id: polls.id,
      title: polls.title,
      status: polls.status,
      activeQuestionId: polls.activeQuestionId,
    })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return null;

  let activeQuestion: PublicPollView["activeQuestion"] = null;
  if (poll.activeQuestionId) {
    const [question] = await db
      .select({ id: questions.id, text: questions.text })
      .from(questions)
      .where(eq(questions.id, poll.activeQuestionId))
      .limit(1);

    if (question) {
      const questionOptions = await db
        .select({ id: options.id, text: options.text })
        .from(options)
        .where(eq(options.questionId, question.id))
        .orderBy(options.position);

      activeQuestion = { id: question.id, text: question.text, options: questionOptions };
    }
  }

  return {
    title: poll.title,
    pollStatus: poll.status as PublicPollView["pollStatus"],
    activeQuestion,
  };
}
