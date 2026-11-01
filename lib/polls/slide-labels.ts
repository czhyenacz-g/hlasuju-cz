import type { SlideKind } from "./types.ts";

// Názvy a značky typů slajdů — jedno místo pro editor i řídicí konzoli.
export const SLIDE_KIND_LABEL: Record<SlideKind, string> = {
  question: "Otázka",
  content: "Obsah",
  results: "Výsledky otázky",
  leaderboard: "Žebříček",
};

export const SLIDE_KIND_ICON: Record<SlideKind, string> = {
  question: "?",
  content: "¶",
  results: "▥",
  leaderboard: "★",
};

// Barevné odlišení typů (pastelová paleta webu).
export const SLIDE_KIND_BADGE: Record<SlideKind, string> = {
  question: "bg-brand text-white",
  content: "bg-pastel-blue text-gray-800",
  results: "bg-pastel-green text-emerald-900",
  leaderboard: "bg-amber-100 text-amber-900",
};

type TitledSlide = { id: number; kind: SlideKind; text: string; body: string | null; resultsQuestionId: number | null };

/** Krátký název slajdu do seznamů (obsah bez nadpisu → začátek textu). */
export function slideTitle(slide: TitledSlide, all: TitledSlide[]): string {
  const text = slide.text.trim();
  switch (slide.kind) {
    case "question":
      return text || "Nová otázka";
    case "content":
      return text || slide.body?.trim().split("\n")[0] || "Obrázek";
    case "results": {
      const target = all.find((other) => other.id === slide.resultsQuestionId && other.kind === "question");
      return target ? `Výsledky: ${target.text}` : "Výsledky – chybí otázka";
    }
    case "leaderboard":
      return text || "Průběžné pořadí";
  }
}
