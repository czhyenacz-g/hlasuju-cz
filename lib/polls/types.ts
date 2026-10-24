export type PollStatus = "active" | "closed";
export type QuestionStatus = "prepared" | "active" | "ended";

export type QuestionImage = { url: string; width: number; height: number; alt: string | null };
export type QuestionLink = { url: string; label: string | null; showDuringVoting: boolean };

export type CreatePollOptionInput = { text: string };
export type CreatePollQuestionInput = { text: string; options: CreatePollOptionInput[]; link?: QuestionLink | null };
export type CreatePollInput = {
  title?: string;
  email?: string;
  questions: CreatePollQuestionInput[];
};

export type CreatePollResult = { publicCode: string; moderatorToken: string; questionIds: number[] };

/** Uložení obsahu existujícího hlasování (editor) — celý požadovaný stav. */
export type UpdatePollOptionInput = { id?: number; text: string };
export type UpdatePollQuestionInput = {
  id?: number;
  text: string;
  options: UpdatePollOptionInput[];
  image: QuestionImage | null;
  link: QuestionLink | null;
};
export type UpdatePollInput = {
  version: number;
  title?: string;
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
  activeQuestion: {
    id: number;
    text: string;
    image: QuestionImage | null;
    /** Jen pokud ho moderátor povolil ukázat už během hlasování. */
    link: PublicQuestionLink | null;
    options: { id: number; text: string }[];
  } | null;
  closedQuestion: {
    id: number;
    text: string;
    image: QuestionImage | null;
    link: PublicQuestionLink | null;
  } | null;
};

export type ModeratorQuestionView = {
  id: number;
  text: string;
  position: number;
  status: QuestionStatus;
  totalVotes: number;
  image: QuestionImage | null;
  link: QuestionLink | null;
  options: { id: number; text: string; votes: number }[];
};

export type ModeratorPollView = {
  title: string | null;
  publicCode: string;
  pollStatus: PollStatus;
  activeQuestionId: number | null;
  questions: ModeratorQuestionView[];
  totalVotes: number;
  uniqueParticipants: number;
};

/** Obsah pro editor (/m/<token>/upravit). `locked` = otázka už byla spuštěná nebo má hlasy. */
export type EditorQuestion = {
  id: number;
  text: string;
  status: QuestionStatus;
  locked: boolean;
  voteCount: number;
  image: QuestionImage | null;
  link: QuestionLink | null;
  options: { id: number; text: string }[];
};

export type EditorContent = {
  publicCode: string;
  title: string | null;
  pollStatus: PollStatus;
  version: number;
  questions: EditorQuestion[];
};

/** Účastnický pohled na finální výsledky — jako ModeratorQuestionView,
 * ale navíc participantSelectedOptionId (a NIKDY participant ID cizích
 * lidí, e-mail moderátora nebo moderatorToken). */
export type FinalResultsQuestion = {
  id: number;
  text: string;
  position: number;
  image: QuestionImage | null;
  link: PublicQuestionLink | null;
  options: { id: number; text: string; votes: number }[];
  totalVotes: number;
  participantSelectedOptionId: number | null;
};

export type FinalResultsView = {
  title: string | null;
  pollStatus: PollStatus;
  questions: FinalResultsQuestion[];
};
