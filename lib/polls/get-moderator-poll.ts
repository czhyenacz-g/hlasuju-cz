import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, participants, polls, questions, votes } from "../../db/schema.ts";
import { computeLeaderboard } from "./leaderboard.ts";
import { LIMITS } from "./limits.ts";
import { questionMediaColumns, remainingMsColumn, toBackgroundImage, toQuestionImages, toQuestionLink, toRemainingMs } from "./question-media.ts";
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
      requireParticipantName: polls.requireParticipantName,
      mode: polls.mode,
      resultsEmailSentAt: polls.resultsEmailSentAt,
      resultsEmailCount: polls.resultsEmailCount,
      backgroundImageUrl: polls.backgroundImageUrl,
      backgroundImageWidth: polls.backgroundImageWidth,
      backgroundImageHeight: polls.backgroundImageHeight,
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
      kind: questions.kind,
      body: questions.body,
      resultsQuestionId: questions.resultsQuestionId,
      points: questions.points,
      speedBonus: questions.speedBonus,
      timeLimitSeconds: questions.timeLimitSeconds,
      remainingMs: remainingMsColumn,
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

  const { leaderboardFor, fastestFor } = await loadLeaderboards(poll.id, poll.requireParticipantName, questionRows);

  const questionViews: ModeratorQuestionView[] = questionRows.map((q) => {
    const questionOptions = optionsByQuestion.get(q.id) ?? [];
    return {
      id: q.id,
      kind: q.kind as ModeratorQuestionView["kind"],
      text: q.text,
      body: q.body,
      resultsQuestionId: q.resultsQuestionId,
      points: q.points,
      speedBonus: q.speedBonus,
      timeLimitSeconds: q.timeLimitSeconds,
      remainingMs: q.status === "active" ? toRemainingMs(q.remainingMs) : null,
      leaderboard: q.kind === "leaderboard" ? leaderboardFor(q.position) : null,
      fastest: q.speedBonus && q.status === "ended" && q.correctOptionId !== null ? fastestFor(q.id, q.correctOptionId) : null,
      position: q.position,
      status: q.status as ModeratorQuestionView["status"],
      images: toQuestionImages(q),
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
    requireParticipantName: poll.requireParticipantName,
    mode: poll.mode as ModeratorPollView["mode"],
    pollStatus: poll.status as ModeratorPollView["pollStatus"],
    activeQuestionId: poll.activeQuestionId,
    backgroundImage: toBackgroundImage(poll),
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

type SlideRow = { id: number; kind: string; position: number; status: string; correctOptionId: number | null; points: number; speedBonus: boolean };

/**
 * Žebříčky slajdů „leaderboard“ — počítá se jen, když prezentace nějaký
 * má. Štítky jako v detailu odpovědí: jméno (u shodných jmen „Anna (2)“),
 * jinak „Anonymní účastník N“ podle pořadí prvního hlasu.
 */
async function loadLeaderboards(pollId: number, named: boolean, slides: SlideRow[]) {
  const needed = slides.some((slide) => slide.kind === "leaderboard" || (slide.speedBonus && slide.status === "ended"));
  if (!needed) return { leaderboardFor: () => null, fastestFor: () => null };
  const db = getDb();

  const voteRows = await db
    .select({ participantId: votes.participantId, questionId: votes.questionId, optionId: votes.optionId, createdAt: votes.createdAt })
    .from(votes)
    .innerJoin(questions, eq(votes.questionId, questions.id))
    .where(eq(questions.pollId, pollId))
    // Pořadí zápisu na serveru — určuje bonus za rychlost (leaderboard.ts).
    .orderBy(votes.createdAt, votes.id);
  const nameRows = named
    ? await db
        .select({ participantId: participants.participantId, name: participants.name })
        .from(participants)
        .where(eq(participants.pollId, pollId))
        .orderBy(participants.createdAt, participants.participantId)
    : [];

  const order = new Map<string, number>();
  for (const row of voteRows) if (!order.has(row.participantId)) order.set(row.participantId, order.size + 1);
  const names = new Map(nameRows.map((row) => [row.participantId, row.name]));
  const sameName = new Map<string, string[]>();
  for (const [participantId, name] of names) {
    const key = name.toLocaleLowerCase("cs");
    sameName.set(key, [...(sameName.get(key) ?? []), participantId]);
  }
  const labelFor = (participantId: string) => {
    const name = names.get(participantId);
    if (!name) return `Anonymní účastník ${order.get(participantId) ?? order.size + 1}`;
    const group = sameName.get(name.toLocaleLowerCase("cs")) ?? [];
    return group.length > 1 ? `${name} (${group.indexOf(participantId) + 1})` : name;
  };

  const typedSlides = slides.map((slide) => ({ ...slide, kind: slide.kind as ModeratorQuestionView["kind"], status: slide.status as ModeratorQuestionView["status"] }));
  return {
    leaderboardFor: (position: number) => computeLeaderboard(typedSlides, position, voteRows, labelFor, [...names.keys()]),
    // Kdo dostal bonus za rychlost (pro slajd výsledků a konzoli).
    fastestFor: (questionId: number, correctOptionId: number) =>
      voteRows
        .filter((vote) => vote.questionId === questionId && vote.optionId === correctOptionId)
        .slice(0, LIMITS.SPEED_BONUS.length)
        .map((vote, index) => ({ label: labelFor(vote.participantId), bonus: LIMITS.SPEED_BONUS[index] })),
  };
}
