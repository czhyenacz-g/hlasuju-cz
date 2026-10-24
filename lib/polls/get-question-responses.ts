import "server-only";
import { and, asc, count, eq, gt, ne, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, participants, polls, questions, votes } from "../../db/schema.ts";
import type { QuestionResponseRow, QuestionResponsesPage } from "./types.ts";

export const RESPONSES_PAGE_SIZE = 100;

type Db = ReturnType<typeof getDb>;

/**
 * Účastníci hlasování očíslovaní podle prvního hlasu — stabilní pořadí
 * pro „Anonymní účastník N“ napříč otázkami, bez zobrazení participant
 * ID. U stejných jmen pořadí v rámci jména („Anna (2)“).
 */
function rankedParticipants(db: Db, pollId: number) {
  return db
    .select({
      participantId: votes.participantId,
      name: participants.name,
      n: sql<number>`(row_number() over (order by min(${votes.createdAt}), ${votes.participantId}))::int`.as("n"),
      nameIndex: sql<number>`(row_number() over (partition by lower(${participants.name}) order by min(${votes.createdAt}), ${votes.participantId}))::int`.as(
        "name_index"
      ),
      nameCount: sql<number>`(count(*) over (partition by lower(${participants.name})))::int`.as("name_count"),
    })
    .from(votes)
    .innerJoin(questions, eq(votes.questionId, questions.id))
    .leftJoin(participants, and(eq(participants.pollId, questions.pollId), eq(participants.participantId, votes.participantId)))
    .where(eq(questions.pollId, pollId))
    .groupBy(votes.participantId, participants.name)
    .as("ranked");
}

function toLabel(row: { name: string | null; n: number; nameIndex: number; nameCount: number }): string {
  if (!row.name) return `Anonymní účastník ${row.n}`;
  return row.nameCount > 1 ? `${row.name} (${row.nameIndex})` : row.name;
}

async function findPoll(db: Db, moderatorToken: string) {
  const [poll] = await db
    .select({ id: polls.id })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);
  return poll ?? null;
}

/**
 * Individuální odpovědi u jedné otázky — JEN pro moderátora (volá se
 * přes moderátorský token). Stránkované, jeden dotaz na stránku.
 */
export async function getQuestionResponses(
  moderatorToken: string,
  questionId: number,
  offset: number
): Promise<QuestionResponsesPage | null> {
  const db = getDb();
  const poll = await findPoll(db, moderatorToken);
  if (!poll) return null;

  const [question] = await db
    .select({ id: questions.id, correctOptionId: questions.correctOptionId, status: questions.status })
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.pollId, poll.id)))
    .limit(1);
  if (!question) return null;
  // Správnost jen u ukončené otázky — stejně jako všude jinde.
  const correctOptionId = question.status === "ended" ? question.correctOptionId : null;

  const ranked = rankedParticipants(db, poll.id);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        name: ranked.name,
        n: ranked.n,
        nameIndex: ranked.nameIndex,
        nameCount: ranked.nameCount,
        optionId: votes.optionId,
        optionText: options.text,
      })
      .from(votes)
      .innerJoin(ranked, eq(ranked.participantId, votes.participantId))
      .innerJoin(options, eq(options.id, votes.optionId))
      .where(eq(votes.questionId, question.id))
      .orderBy(asc(ranked.n))
      .limit(RESPONSES_PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(votes).where(eq(votes.questionId, question.id)),
  ]);

  return {
    questionId: question.id,
    total,
    offset,
    rows: rows.map(
      (row): QuestionResponseRow => ({
        label: toLabel(row),
        optionText: row.optionText,
        correct: correctOptionId === null ? null : row.optionId === correctOptionId,
      })
    ),
  };
}

export type PollResponseRow = QuestionResponseRow & { questionPosition: number; questionText: string };

/** Všechny individuální odpovědi spuštěných otázek (CSV pro moderátora jmenovitého hlasování). */
export async function getPollResponses(pollId: number): Promise<PollResponseRow[]> {
  const db = getDb();
  const ranked = rankedParticipants(db, pollId);
  const rows = await db
    .select({
      name: ranked.name,
      n: ranked.n,
      nameIndex: ranked.nameIndex,
      nameCount: ranked.nameCount,
      optionId: votes.optionId,
      optionText: options.text,
      questionPosition: questions.position,
      questionText: questions.text,
      questionStatus: questions.status,
      correctOptionId: questions.correctOptionId,
    })
    .from(votes)
    .innerJoin(ranked, eq(ranked.participantId, votes.participantId))
    .innerJoin(options, eq(options.id, votes.optionId))
    .innerJoin(questions, eq(questions.id, votes.questionId))
    .where(and(eq(questions.pollId, pollId), ne(questions.status, "prepared")))
    .orderBy(asc(questions.position), asc(ranked.n));

  return rows.map((row) => ({
    label: toLabel(row),
    optionText: row.optionText,
    correct: row.questionStatus === "ended" && row.correctOptionId !== null ? row.optionId === row.correctOptionId : null,
    questionPosition: row.questionPosition,
    questionText: row.questionText,
  }));
}
