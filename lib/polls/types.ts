export type PollStatus = "active" | "closed";
export type QuestionStatus = "prepared" | "active" | "ended";
/** "live" = živé hlasování s moderátorem, "self_service" = veřejná anketa (jedna otázka, hlasuje se hned). */
export type PollMode = "live" | "self_service";
/**
 * Typ slajdu prezentace. Historická data jsou vždy "question". Jen otázka
 * má odpovědi a hlasy; ostatní slajdy zůstávají ve stavu "prepared".
 */
export type SlideKind = "question" | "content" | "results" | "leaderboard";

export type QuestionImage = { url: string; width: number; height: number; alt: string | null };
export type QuestionLink = { url: string; label: string | null; showDuringVoting: boolean };

export type CreatePollOptionInput = { text: string };
/** `correctOptionIndex` = pořadí správné odpovědi v `options`, null = bez správné odpovědi. */
export type CreatePollQuestionInput = {
  /** Výchozí "question". */
  kind?: SlideKind;
  /** Otázka: text otázky; obsah: nadpis (může být prázdný); žebříček: vlastní nadpis. */
  text: string;
  options: CreatePollOptionInput[];
  link?: QuestionLink | null;
  correctOptionIndex?: number | null;
  /** Obsahový slajd: text (odstavce oddělené prázdným řádkem). */
  body?: string | null;
  /** Výsledkový slajd: index otázky ve stejném seznamu (musí být před ním). */
  resultsQuestionIndex?: number | null;
  /** Body za správnou odpověď (výchozí 1). */
  points?: number;
  /** Bonus +3/+2/+1 pro první tři správné odpovědi (výchozí false). */
  speedBonus?: boolean;
  /** Odpočet na odpověď v sekundách, null = bez limitu. */
  timeLimitSeconds?: number | null;
};
export type CreatePollInput = {
  title?: string;
  email?: string;
  /** Jmenovitý režim (jen při vytvoření; výchozí false = anonymní). */
  requireParticipantName?: boolean;
  /** Výchozí "live"; "self_service" jen s jedinou otázkou. */
  mode?: PollMode;
  questions: CreatePollQuestionInput[];
};

export type CreatePollResult = { publicCode: string; moderatorToken: string; questionIds: number[] };

/** Uložení obsahu existujícího hlasování (editor) — celý požadovaný stav. */
export type UpdatePollOptionInput = { id?: number; text: string };
export type UpdatePollQuestionInput = {
  id?: number;
  kind?: SlideKind;
  text: string;
  options: UpdatePollOptionInput[];
  /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
  images: QuestionImage[];
  link: QuestionLink | null;
  correctOptionIndex: number | null;
  body?: string | null;
  /** Index cílové otázky v `questions` téhož požadavku (ID nových otázek ještě neexistují). */
  resultsQuestionIndex?: number | null;
  points?: number;
  speedBonus?: boolean;
  timeLimitSeconds?: number | null;
};
/** Obrázek na pozadí promítání (bez popisu — je dekorativní). */
export type BackgroundImage = { url: string; width: number; height: number };

export type UpdatePollInput = {
  version: number;
  title?: string;
  /** undefined = beze změny (starší klient), null = odebrat. */
  backgroundImage?: BackgroundImage | null;
  questions: UpdatePollQuestionInput[];
};

/** Veřejný odkaz pro účastníky — bez příznaku showDuringVoting. */
export type PublicQuestionLink = { url: string; label: string | null };

/**
 * Veřejný (účastnický) pohled — NIKDY neobsahuje moderatorToken ani
 * připravené (nespuštěné) otázky. `activeQuestion` = otázka, na kterou
 * jde právě hlasovat; `closedQuestion` = moderátor otázku ukončil, ale
 * ještě nespustil další (fáze "vyhodnocení" — tady se odkrývá odkaz).
 */
export type PublicPollView = {
  title: string | null;
  pollStatus: PollStatus;
  mode: PollMode;
  /** Jen příznak — jména účastníků veřejné API nikdy nevrací. */
  requireParticipantName: boolean;
  activeQuestion: {
    id: number;
    text: string;
    /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
    images: QuestionImage[];
    /** Jen pokud ho moderátor povolil ukázat už během hlasování. */
    link: PublicQuestionLink | null;
    options: { id: number; text: string }[];
    /** Odpočet: kolik ms zbývá podle času serveru (null = bez limitu). 0 = čas vypršel. */
    remainingMs: number | null;
    timeLimitSeconds: number | null;
  } | null;
  closedQuestion: {
    id: number;
    text: string;
    /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
    images: QuestionImage[];
    link: PublicQuestionLink | null;
    options: { id: number; text: string }[];
    /** Jen tady (otázka ukončená) — nikdy v `activeQuestion`. */
    correctOptionId: number | null;
  } | null;
  /**
   * Promítá se slajd, který není otázkou (obsah, výsledky, žebříček).
   * Účastník vidí jen stav „Prezentace pokračuje“, u výsledků navíc
   * vyhodnocení své odpovědi (`closedQuestion`). Obsah slajdu se neposílá.
   */
  slide: { kind: Exclude<SlideKind, "question"> } | null;
};

/** Řádek žebříčku. `tied` = sdílené umístění s jiným účastníkem. */
export type LeaderboardEntry = { rank: number; tied: boolean; label: string; points: number };
export type LeaderboardView = {
  entries: LeaderboardEntry[];
  /** Kolik bodovaných otázek před slajdem už bylo uzavřeno (započteno). */
  scoredQuestions: number;
  /** Kolik bodovaných otázek před slajdem je celkem (i neodehraných). */
  scoredQuestionsTotal: number;
  maxPoints: number;
};

export type ModeratorQuestionView = {
  id: number;
  kind: SlideKind;
  text: string;
  body: string | null;
  resultsQuestionId: number | null;
  points: number;
  speedBonus: boolean;
  timeLimitSeconds: number | null;
  /** Odpočet běžící otázky: zbývající ms podle času serveru (null = bez odpočtu / neběží). */
  remainingMs: number | null;
  /** Jen u uzavřené otázky s bonusem za rychlost: nejrychlejší správné odpovědi. */
  fastest: { label: string; bonus: number }[] | null;
  /** Jen u slajdu žebříčku. */
  leaderboard: LeaderboardView | null;
  position: number;
  status: QuestionStatus;
  totalVotes: number;
  /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
  images: QuestionImage[];
  link: QuestionLink | null;
  options: { id: number; text: string; votes: number }[];
  correctOptionId: number | null;
};

export type ModeratorPollView = {
  title: string | null;
  publicCode: string;
  requireParticipantName: boolean;
  mode: PollMode;
  pollStatus: PollStatus;
  activeQuestionId: number | null;
  /** Jen pro plátno; veřejný pohled ho neposílá. */
  backgroundImage: BackgroundImage | null;
  questions: ModeratorQuestionView[];
  totalVotes: number;
  uniqueParticipants: number;
  /** Odeslání výsledků e-mailem (jen po ukončení, jen na adresu z vytvoření). */
  resultsEmail: { to: string | null; configured: boolean; lastSentAt: string | null; remaining: number };
};

/** Obsah pro editor (/m/<token>/upravit). `locked` = otázka už byla spuštěná nebo má hlasy. */
export type EditorQuestion = {
  id: number;
  kind: SlideKind;
  text: string;
  body: string | null;
  resultsQuestionId: number | null;
  points: number;
  speedBonus: boolean;
  timeLimitSeconds: number | null;
  status: QuestionStatus;
  locked: boolean;
  voteCount: number;
  /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
  images: QuestionImage[];
  link: QuestionLink | null;
  options: { id: number; text: string }[];
  correctOptionId: number | null;
};

export type EditorContent = {
  publicCode: string;
  title: string | null;
  pollStatus: PollStatus;
  mode: PollMode;
  /** Žebříček ukazuje jména jen u jmenovitého hlasování. */
  requireParticipantName: boolean;
  version: number;
  backgroundImage: BackgroundImage | null;
  questions: EditorQuestion[];
};

/** Účastnický pohled na finální výsledky — jako ModeratorQuestionView,
 * ale navíc participantSelectedOptionId (a NIKDY participant ID cizích
 * lidí, e-mail moderátora nebo moderatorToken). */
export type FinalResultsQuestion = {
  id: number;
  text: string;
  position: number;
  /** 0–3 obrázky slajdu (zobrazí se vedle sebe), první = hlavní. */
  images: QuestionImage[];
  link: PublicQuestionLink | null;
  options: { id: number; text: string; votes: number }[];
  correctOptionId: number | null;
  totalVotes: number;
  participantSelectedOptionId: number | null;
};

export type FinalResultsView = {
  title: string | null;
  pollStatus: PollStatus;
  mode: PollMode;
  questions: FinalResultsQuestion[];
};

/** Řádek detailu odpovědí (jen moderátor). `label` = jméno, nebo „Anonymní účastník N“. */
export type QuestionResponseRow = { label: string; optionText: string; correct: boolean | null };

export type QuestionResponsesPage = {
  questionId: number;
  total: number;
  offset: number;
  rows: QuestionResponseRow[];
};
