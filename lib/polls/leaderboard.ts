import type { LeaderboardEntry, LeaderboardView, QuestionStatus, SlideKind } from "./types.ts";

export type LeaderboardSlide = {
  id: number;
  kind: SlideKind;
  position: number;
  status: QuestionStatus;
  correctOptionId: number | null;
  points: number;
};
export type LeaderboardVote = { participantId: string; questionId: number; optionId: number };

/**
 * Pořadí účastníků pro slajd žebříčku (čistá funkce, autoritativní výpočet
 * na serveru — viz get-moderator-poll.ts).
 *
 * - Bodované otázky = otázky se správnou odpovědí PŘED slajdem žebříčku
 *   (podle pořadí v prezentaci). Pozdější otázky se do dřívějšího žebříčku
 *   nikdy nepromítnou, ani když se prezentující vrátí zpět.
 * - Započítají se jen otázky uzavřené v tomto běhu (status "ended");
 *   otevřená nebo neodehraná otázka zatím 0 bodů.
 * - Správně = body otázky, jinak 0. Žádné bonusy za rychlost ani záporné body.
 *   Hlas je jeden na otázku a účastníka (unique index), takže se nic
 *   nepřičte dvakrát.
 * - Účastníci: všichni, kdo hlasovali u některé otázky před žebříčkem,
 *   a u jmenovitého hlasování i ti, kdo zadali jméno. Shodné body = shodné
 *   umístění („1, 2, 2, 4“).
 */
export function computeLeaderboard(
  slides: LeaderboardSlide[],
  leaderboardPosition: number,
  votes: LeaderboardVote[],
  labelFor: (participantId: string) => string,
  registered: string[] = []
): LeaderboardView {
  const before = slides.filter((slide) => slide.kind === "question" && slide.position < leaderboardPosition);
  const scoredAll = before.filter((slide) => slide.correctOptionId !== null);
  const scored = new Map(scoredAll.filter((slide) => slide.status === "ended").map((slide) => [slide.id, slide]));
  const beforeIds = new Set(before.map((slide) => slide.id));

  const totals = new Map<string, number>();
  for (const participantId of registered) totals.set(participantId, 0);
  for (const vote of votes) {
    if (!beforeIds.has(vote.questionId)) continue;
    const question = scored.get(vote.questionId);
    const gained = question && vote.optionId === question.correctOptionId ? question.points : 0;
    totals.set(vote.participantId, (totals.get(vote.participantId) ?? 0) + gained);
  }

  const rows = [...totals.entries()]
    .map(([participantId, points]) => ({ label: labelFor(participantId), points }))
    .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label, "cs"));

  const entries: LeaderboardEntry[] = rows.map((row) => {
    // Soutěžní pořadí: stejné body = stejné místo, další místo se přeskočí.
    const firstWithSamePoints = rows.findIndex((other) => other.points === row.points);
    const tied = rows.filter((other) => other.points === row.points).length > 1;
    return { rank: firstWithSamePoints + 1, tied, label: row.label, points: row.points };
  });

  return {
    entries,
    scoredQuestions: scored.size,
    scoredQuestionsTotal: scoredAll.length,
    maxPoints: [...scored.values()].reduce((sum, slide) => sum + slide.points, 0),
  };
}
