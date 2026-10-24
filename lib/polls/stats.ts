import type { ModeratorQuestionView } from "./types.ts";

/** Podíl správných hlasů v % (null = otázka nemá správnou odpověď nebo nemá hlasy). */
export function questionSuccess(question: ModeratorQuestionView): number | null {
  if (question.status !== "ended" || question.correctOptionId === null || question.totalVotes === 0) return null;
  const correct = question.options.find((option) => option.id === question.correctOptionId)?.votes ?? 0;
  return Math.round((correct / question.totalVotes) * 100);
}

/**
 * Celková úspěšnost = správné hlasy / všechny hlasy u SPUŠTĚNÝCH otázek
 * se správnou odpovědí. `null` = hlasování nemá žádnou takovou otázku
 * (pak se údaj vůbec nezobrazuje).
 */
export function overallSuccess(questions: ModeratorQuestionView[]): { percent: number | null } | null {
  const quiz = questions.filter((question) => question.status === "ended" && question.correctOptionId !== null);
  if (quiz.length === 0) return null;
  const total = quiz.reduce((sum, question) => sum + question.totalVotes, 0);
  const correct = quiz.reduce((sum, question) => sum + (question.options.find((option) => option.id === question.correctOptionId)?.votes ?? 0), 0);
  return { percent: total > 0 ? Math.round((correct / total) * 100) : null };
}
