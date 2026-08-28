export type PollStatus = "active" | "closed";
export type QuestionStatus = "prepared" | "active" | "ended";

export type CreatePollOptionInput = { text: string };
export type CreatePollQuestionInput = { text: string; options: CreatePollOptionInput[] };
export type CreatePollInput = {
  title?: string;
  email?: string;
  questions: CreatePollQuestionInput[];
};

export type CreatePollResult = { publicCode: string; moderatorToken: string };

/** Veřejný (účastnický) pohled — NIKDY neobsahuje moderatorToken. */
export type PublicPollView = {
  title: string | null;
  pollStatus: PollStatus;
  activeQuestion: {
    id: number;
    text: string;
    options: { id: number; text: string }[];
  } | null;
};

export type ModeratorQuestionView = {
  id: number;
  text: string;
  position: number;
  status: QuestionStatus;
  totalVotes: number;
  options: { id: number; text: string; votes: number }[];
};

export type ModeratorPollView = {
  title: string | null;
  publicCode: string;
  pollStatus: PollStatus;
  activeQuestionId: number | null;
  questions: ModeratorQuestionView[];
};
