import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import { questionMediaColumns, remainingMsColumn, toPublicLink, toQuestionImages, toQuestionLink, toRemainingMs } from "./question-media.ts";
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
      mode: polls.mode,
    })
    .from(polls)
    .where(and(eq(polls.publicCode, publicCode), gt(polls.expiresAt, new Date())))
    .limit(1);

  if (!poll) return null;

  let activeQuestion: PublicPollView["activeQuestion"] = null;
  let closedQuestion: PublicPollView["closedQuestion"] = null;
  let slide: PublicPollView["slide"] = null;

  if (poll.activeQuestionId && poll.status === "active") {
    let question: Awaited<ReturnType<typeof selectQuestion>>[number] | undefined = (await selectQuestion(poll.id, poll.activeQuestionId))[0];

    // Promítá se slajd, který není otázkou: účastníkům jen jeho typ (obsah
    // slajdu se na mobily neposílá). U výsledků otázky navíc vyhodnocení
    // té otázky — ale jen když už je uzavřená (správná odpověď nikdy dřív).
    if (question && question.kind !== "question") {
      slide = { kind: question.kind as NonNullable<PublicPollView["slide"]>["kind"] };
      question = question.kind === "results" && question.resultsQuestionId ? (await selectQuestion(poll.id, question.resultsQuestionId))[0] : undefined;
      if (question?.status !== "ended" || question.kind !== "question") question = undefined;
    }

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
        images: toQuestionImages(question),
        link: link?.showDuringVoting ? toPublicLink(link) : null,
        options: questionOptions,
        remainingMs: toRemainingMs(question.remainingMs),
        timeLimitSeconds: question.timeLimitSeconds,
      };
    } else if (question?.status === "ended") {
      closedQuestion = {
        id: question.id,
        text: question.text,
        images: toQuestionImages(question),
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
    mode: poll.mode as PublicPollView["mode"],
    activeQuestion,
    closedQuestion,
    slide,
  };
}

function selectQuestion(pollId: number, questionId: number) {
  return getDb()
    .select({
      id: questions.id,
      text: questions.text,
      status: questions.status,
      kind: questions.kind,
      resultsQuestionId: questions.resultsQuestionId,
      correctOptionId: questions.correctOptionId,
      timeLimitSeconds: questions.timeLimitSeconds,
      remainingMs: remainingMsColumn,
      ...questionMediaColumns,
    })
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.pollId, pollId)))
    .limit(1);
}
