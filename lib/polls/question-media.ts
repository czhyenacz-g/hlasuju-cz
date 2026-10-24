import { questions } from "../../db/schema.ts";
import type { PublicQuestionLink, QuestionImage, QuestionLink } from "./types.ts";

// Sloupce obrázku a odkazu pro `db.select({...})` — jedno místo, aby
// všechny pohledy (moderátor, účastník, editor, výsledky) četly totéž.
export const questionMediaColumns = {
  imageUrl: questions.imageUrl,
  imageWidth: questions.imageWidth,
  imageHeight: questions.imageHeight,
  imageAlt: questions.imageAlt,
  linkUrl: questions.linkUrl,
  linkLabel: questions.linkLabel,
  linkShowDuringVoting: questions.linkShowDuringVoting,
};

type MediaRow = {
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  linkShowDuringVoting: boolean;
};

export function toQuestionImage(row: MediaRow): QuestionImage | null {
  if (!row.imageUrl || !row.imageWidth || !row.imageHeight) return null;
  return { url: row.imageUrl, width: row.imageWidth, height: row.imageHeight, alt: row.imageAlt };
}

export function toQuestionLink(row: MediaRow): QuestionLink | null {
  if (!row.linkUrl) return null;
  return { url: row.linkUrl, label: row.linkLabel, showDuringVoting: row.linkShowDuringVoting };
}

export function toPublicLink(link: QuestionLink | null): PublicQuestionLink | null {
  return link ? { url: link.url, label: link.label } : null;
}
