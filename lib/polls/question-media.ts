import { questions } from "../../db/schema.ts";
import type { BackgroundImage, PublicQuestionLink, QuestionImage, QuestionLink } from "./types.ts";

// Sloupce obrázku a odkazu pro `db.select({...})` — jedno místo, aby
// všechny pohledy (moderátor, účastník, editor, výsledky) četly totéž.
export const questionMediaColumns = {
  imageUrl: questions.imageUrl,
  imageWidth: questions.imageWidth,
  imageHeight: questions.imageHeight,
  imageAlt: questions.imageAlt,
  extraImages: questions.extraImages,
  linkUrl: questions.linkUrl,
  linkLabel: questions.linkLabel,
  linkShowDuringVoting: questions.linkShowDuringVoting,
};

type MediaRow = {
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAlt: string | null;
  extraImages: QuestionImage[] | null;
  linkUrl: string | null;
  linkLabel: string | null;
  linkShowDuringVoting: boolean;
};

/** Všechny obrázky slajdu v pořadí: první ze sloupců image_*, další z extra_images. */
export function toQuestionImages(row: Pick<MediaRow, "imageUrl" | "imageWidth" | "imageHeight" | "imageAlt" | "extraImages">): QuestionImage[] {
  if (!row.imageUrl || !row.imageWidth || !row.imageHeight) return [];
  return [{ url: row.imageUrl, width: row.imageWidth, height: row.imageHeight, alt: row.imageAlt }, ...(row.extraImages ?? [])];
}

/** Sloupce pro zápis obrázků slajdu (opak toQuestionImages). */
export function questionImageColumns(images: QuestionImage[]) {
  const [first, ...rest] = images;
  return {
    imageUrl: first?.url ?? null,
    imageWidth: first?.width ?? null,
    imageHeight: first?.height ?? null,
    imageAlt: first?.alt ?? null,
    extraImages: rest.length > 0 ? rest : null,
  };
}

/** URL všech obrázků slajdu (pro úklid úložiště). */
export function questionImageUrls(row: { imageUrl: string | null; extraImages: QuestionImage[] | null }): string[] {
  return [row.imageUrl, ...(row.extraImages ?? []).map((image) => image.url)].filter((url): url is string => Boolean(url));
}

/** Pozadí prezentace z řádku pollu (polls.background_image_*). */
export function toBackgroundImage(row: {
  backgroundImageUrl: string | null;
  backgroundImageWidth: number | null;
  backgroundImageHeight: number | null;
}): BackgroundImage | null {
  if (!row.backgroundImageUrl || !row.backgroundImageWidth || !row.backgroundImageHeight) return null;
  return { url: row.backgroundImageUrl, width: row.backgroundImageWidth, height: row.backgroundImageHeight };
}

export function toQuestionLink(row: MediaRow): QuestionLink | null {
  if (!row.linkUrl) return null;
  return { url: row.linkUrl, label: row.linkLabel, showDuringVoting: row.linkShowDuringVoting };
}

export function toPublicLink(link: QuestionLink | null): PublicQuestionLink | null {
  return link ? { url: link.url, label: link.label } : null;
}
