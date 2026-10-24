import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions, votes } from "../../db/schema.ts";
import { questionMediaColumns, toQuestionImage, toQuestionLink } from "./question-media.ts";
import { isQuestionLocked } from "./update-poll-content.ts";
import type { EditorContent, EditorQuestion, PollStatus, QuestionStatus } from "./types.ts";

/** Obsah pro editor — jen přes moderátorský token. `null` = neplatný token nebo vypršelo. */
export async function getEditorContent(moderatorToken: string): Promise<EditorContent | null> {
  const db = getDb();

  const [poll] = await db
    .select({ id: polls.id, title: polls.title, publicCode: polls.publicCode, status: polls.status, version: polls.version })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return null;

  const questionRows = await db
    .select({ id: questions.id, text: questions.text, status: questions.status, ...questionMediaColumns })
    .from(questions)
    .where(eq(questions.pollId, poll.id))
    .orderBy(questions.position);

  const optionRows = await db
    .select({ id: options.id, questionId: options.questionId, text: options.text })
    .from(options)
    .innerJoin(questions, eq(options.questionId, questions.id))
    .where(eq(questions.pollId, poll.id))
    .orderBy(options.position);

  const voteRows = await db
    .select({ questionId: votes.questionId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(votes)
    .innerJoin(questions, eq(votes.questionId, questions.id))
    .where(eq(questions.pollId, poll.id))
    .groupBy(votes.questionId);

  const voteCounts = new Map(voteRows.map((row) => [row.questionId, row.count]));
  const optionsByQuestion = new Map<number, EditorQuestion["options"]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.questionId) ?? [];
    list.push({ id: row.id, text: row.text });
    optionsByQuestion.set(row.questionId, list);
  }

  return {
    publicCode: poll.publicCode,
    title: poll.title,
    pollStatus: poll.status as PollStatus,
    version: poll.version,
    questions: questionRows.map((row) => {
      const voteCount = voteCounts.get(row.id) ?? 0;
      return {
        id: row.id,
        text: row.text,
        status: row.status as QuestionStatus,
        locked: isQuestionLocked({ status: row.status, voteCount }),
        voteCount,
        image: toQuestionImage(row),
        link: toQuestionLink(row),
        options: optionsByQuestion.get(row.id) ?? [],
      };
    }),
  };
}
