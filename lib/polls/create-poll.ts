import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { options, polls, questions } from "../../db/schema.ts";
import { LIMITS } from "./limits.ts";
import { generateModeratorToken, generatePublicCode } from "./tokens.ts";
import type { CreatePollInput, CreatePollResult } from "./types.ts";

const MAX_CODE_ATTEMPTS = 5;

/**
 * Vytvoří poll + otázky + odpovědi v jedné transakci (buď vznikne
 * kompletně celé hlasování, nebo nic). Veřejný kód se generuje s
 * retry na unique constraint kolizi (6místných kódů je 900 000, kolize
 * jsou vzácné, ale ne nemožné — viz zadání "veřejný kód musí být
 * krátký").
 */
export async function createPoll(input: CreatePollInput): Promise<CreatePollResult> {
  const db = getDb();
  const moderatorToken = generateModeratorToken();
  const expiresAt = new Date(Date.now() + LIMITS.POLL_TTL_DAYS * 24 * 60 * 60 * 1000);

  // ID otázek vrací kvůli editoru: obrázky jde nahrát až s moderátorským
  // tokenem, takže editor je po vytvoření nahraje a doplní uložením obsahu.
  const questionIds: number[] = [];

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const publicCode = generatePublicCode();

    try {
      await db.transaction(async (tx) => {
        const [poll] = await tx
          .insert(polls)
          .values({
            title: input.title ?? null,
            publicCode,
            moderatorToken,
            email: input.email ?? null,
            status: "active",
            expiresAt,
          })
          .returning({ id: polls.id });

        questionIds.length = 0;
        for (const [index, question] of input.questions.entries()) {
          const [insertedQuestion] = await tx
            .insert(questions)
            .values({
              pollId: poll.id,
              text: question.text,
              position: index,
              status: "prepared",
              linkUrl: question.link?.url ?? null,
              linkLabel: question.link?.label ?? null,
              linkShowDuringVoting: question.link?.showDuringVoting ?? false,
            })
            .returning({ id: questions.id });
          questionIds.push(insertedQuestion.id);

          const insertedOptions = await tx
            .insert(options)
            .values(
              question.options.map((option, optionIndex) => ({
                questionId: insertedQuestion.id,
                text: option.text,
                position: optionIndex,
              }))
            )
            .returning({ id: options.id, position: options.position });

          const correct = insertedOptions.find((option) => option.position === question.correctOptionIndex);
          if (correct) {
            await tx.update(questions).set({ correctOptionId: correct.id }).where(eq(questions.id, insertedQuestion.id));
          }
        }
      });

      return { publicCode, moderatorToken, questionIds };
    } catch (error) {
      // 23505 = unique_violation (Postgres) — jen na publicCode kolizi
      // zkusíme znovu s novým kódem, cokoliv jiného propustíme dál.
      const isUniqueViolation =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
      if (!isUniqueViolation || attempt === MAX_CODE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("Nepodařilo se vygenerovat unikátní kód hlasování.");
}
