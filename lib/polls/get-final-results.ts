import "server-only";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions, votes } from "../../db/schema.ts";
import { questionMediaColumns, toPublicLink, toQuestionImage, toQuestionLink } from "./question-media.ts";
import type { FinalResultsQuestion, FinalResultsView } from "./types.ts";

export type FinalResultsResult =
  | { ok: true; results: FinalResultsView }
  | { ok: false; reason: "poll_not_found" | "poll_not_closed" };

/**
 * Finální výsledky pro účastníky — JEN pro ukončené hlasování. Během
 * živého hlasování by jinak kdokoli s 6místným kódem viděl i nespuštěné
 * otázky a průběžné výsledky (a v budoucím soutěžním režimu správné
 * odpovědi). I po ukončení vrací jen otázky, které moderátor opravdu
 * spustil — nikdy nespuštěné "připravené".
 *
 * NIKDY nevrací moderatorToken, e-mail moderátora ani cizí participant
 * ID — jen to, jestli DANÝ participantId u dané otázky hlasoval.
 */
export async function getFinalResults(publicCode: string, participantId: string | null): Promise<FinalResultsResult> {
  const db = getDb();

  const [poll] = await db
    .select({ id: polls.id, title: polls.title, status: polls.status })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return { ok: false, reason: "poll_not_found" };
  if (poll.status !== "closed") return { ok: false, reason: "poll_not_closed" };

  const questionRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      position: questions.position,
      correctOptionId: questions.correctOptionId,
      ...questionMediaColumns,
    })
    .from(questions)
    .where(and(eq(questions.pollId, poll.id), ne(questions.status, "prepared")))
    .orderBy(questions.position);

  const optionRows = await db
    .select({
      id: options.id,
      questionId: options.questionId,
      text: options.text,
      position: options.position,
      votes: sql<number>`count(${votes.id})`.mapWith(Number),
    })
    .from(options)
    .innerJoin(questions, eq(options.questionId, questions.id))
    .leftJoin(votes, eq(votes.optionId, options.id))
    .where(and(eq(questions.pollId, poll.id), ne(questions.status, "prepared")))
    .groupBy(options.id)
    .orderBy(options.position);

  const optionsByQuestion = new Map<number, FinalResultsQuestion["options"]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.questionId) ?? [];
    list.push({ id: row.id, text: row.text, votes: row.votes });
    optionsByQuestion.set(row.questionId, list);
  }

  const selectedByQuestion = new Map<number, number>();
  const questionIds = questionRows.map((q) => q.id);
  if (participantId && questionIds.length > 0) {
    const myVotes = await db
      .select({ questionId: votes.questionId, optionId: votes.optionId })
      .from(votes)
      .where(and(inArray(votes.questionId, questionIds), eq(votes.participantId, participantId)));
    for (const v of myVotes) selectedByQuestion.set(v.questionId, v.optionId);
  }

  const questionViews: FinalResultsQuestion[] = questionRows.map((q) => {
    const questionOptions = optionsByQuestion.get(q.id) ?? [];
    return {
      id: q.id,
      text: q.text,
      position: q.position,
      image: toQuestionImage(q),
      link: toPublicLink(toQuestionLink(q)),
      options: questionOptions,
      // Hlasování je ukončené (viz výše), všechny otázky jsou ukončené.
      correctOptionId: q.correctOptionId,
      totalVotes: questionOptions.reduce((sum, o) => sum + o.votes, 0),
      participantSelectedOptionId: selectedByQuestion.get(q.id) ?? null,
    };
  });

  return {
    ok: true,
    results: {
      title: poll.title,
      pollStatus: poll.status as FinalResultsView["pollStatus"],
      questions: questionViews,
    },
  };
}
