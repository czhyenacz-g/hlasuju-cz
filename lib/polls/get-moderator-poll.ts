import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions, votes } from "../../db/schema.ts";
import { questionMediaColumns, toQuestionImage, toQuestionLink } from "./question-media.ts";
import { isEmailConfigured } from "../email/send-email.ts";
import { maskEmail, RESULTS_EMAIL_MAX_SENDS } from "./send-results-email.ts";
import type { ModeratorPollView, ModeratorQuestionView } from "./types.ts";

/**
 * `null` = token neplatný NEBO poll vypršel. Vote počty se počítají
 * živě (COUNT ... GROUP BY), žádný denormalizovaný sloupec — pro
 * očekávaný rozsah (prezentace/školení, desítky až stovky hlasů) je to
 * nejjednodušší a nejspolehlivější řešení (žádné riziko rozjetí cache).
 */
export async function getModeratorPoll(moderatorToken: string): Promise<ModeratorPollView | null> {
  const db = getDb();

  const [poll] = await db
    .select({
      id: polls.id,
      title: polls.title,
      publicCode: polls.publicCode,
      status: polls.status,
      activeQuestionId: polls.activeQuestionId,
      email: polls.email,
      resultsEmailSentAt: polls.resultsEmailSentAt,
      resultsEmailCount: polls.resultsEmailCount,
    })
    .from(polls)
    .where(and(eq(polls.moderatorToken, moderatorToken), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return null;

  const questionRows = await db
    .select({
      id: questions.id,
      text: questions.text,
      position: questions.position,
      status: questions.status,
      correctOptionId: questions.correctOptionId,
      ...questionMediaColumns,
    })
    .from(questions)
    .where(eq(questions.pollId, poll.id))
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
    .where(eq(questions.pollId, poll.id))
    .groupBy(options.id)
    .orderBy(options.position);

  const optionsByQuestion = new Map<number, ModeratorQuestionView["options"]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.questionId) ?? [];
    list.push({ id: row.id, text: row.text, votes: row.votes });
    optionsByQuestion.set(row.questionId, list);
  }

  const questionViews: ModeratorQuestionView[] = questionRows.map((q) => {
    const questionOptions = optionsByQuestion.get(q.id) ?? [];
    return {
      id: q.id,
      text: q.text,
      position: q.position,
      status: q.status as ModeratorQuestionView["status"],
      image: toQuestionImage(q),
      link: toQuestionLink(q),
      options: questionOptions,
      correctOptionId: q.correctOptionId,
      totalVotes: questionOptions.reduce((sum, o) => sum + o.votes, 0),
    };
  });

  const [{ uniqueParticipants }] = await db
    .select({ uniqueParticipants: sql<number>`count(distinct ${votes.participantId})`.mapWith(Number) })
    .from(votes)
    .innerJoin(questions, eq(votes.questionId, questions.id))
    .where(eq(questions.pollId, poll.id));

  return {
    title: poll.title,
    publicCode: poll.publicCode,
    pollStatus: poll.status as ModeratorPollView["pollStatus"],
    activeQuestionId: poll.activeQuestionId,
    questions: questionViews,
    totalVotes: questionViews.reduce((sum, q) => sum + q.totalVotes, 0),
    uniqueParticipants,
    // Jen maskovaná adresa — moderátorský odkaz se sdílí s kolegy a
    // celou adresu z něj nikdo nemá vyčíst.
    resultsEmail: {
      to: poll.email ? maskEmail(poll.email) : null,
      configured: isEmailConfigured(),
      lastSentAt: poll.resultsEmailSentAt?.toISOString() ?? null,
      remaining: Math.max(0, RESULTS_EMAIL_MAX_SENDS - poll.resultsEmailCount),
    },
  };
}
