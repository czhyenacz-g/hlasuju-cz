import * as createRoute from "../../app/api/polls/route.ts";
import * as activateRoute from "../../app/api/polls/moderator/[moderatorToken]/activate/route.ts";
import * as closeQuestionRoute from "../../app/api/polls/moderator/[moderatorToken]/close-question/route.ts";
import * as endRoute from "../../app/api/polls/moderator/[moderatorToken]/end/route.ts";
import * as moderatorRoute from "../../app/api/polls/moderator/[moderatorToken]/route.ts";
import * as contentRoute from "../../app/api/polls/moderator/[moderatorToken]/content/route.ts";
import * as publicRoute from "../../app/api/polls/public/[publicCode]/route.ts";
import * as voteRoute from "../../app/api/polls/public/[publicCode]/vote/route.ts";
import * as finalResultsRoute from "../../app/api/polls/public/[publicCode]/final-results/route.ts";
import { jsonRequest, routeParams } from "./db.ts";

export const SAMPLE_QUESTIONS = [
  { text: "Jaký je to typ zranění?", options: [{ text: "Odřenina" }, { text: "Řezná rána" }, { text: "Popálenina" }] },
  { text: "TAJNÁ DRUHÁ OTÁZKA", options: [{ text: "TAJNÁ ODPOVĚĎ A" }, { text: "TAJNÁ ODPOVĚĎ B" }] },
  { text: "TAJNÁ TŘETÍ OTÁZKA", options: [{ text: "Ano" }, { text: "Ne" }] },
];

export async function createPoll(body: Record<string, unknown> = { title: "Test", questions: SAMPLE_QUESTIONS }) {
  const response = await createRoute.POST(jsonRequest("/api/polls", "POST", body) as never);
  return { response, body: await response.json() };
}

export async function getModerator(token: string) {
  const response = await moderatorRoute.GET(jsonRequest(`/api/polls/moderator/${token}`, "GET"), routeParams({ moderatorToken: token }));
  return { response, body: await response.json() };
}

export async function getContent(token: string) {
  const response = await contentRoute.GET(jsonRequest(`/x`, "GET"), routeParams({ moderatorToken: token }));
  return { response, body: await response.json() };
}

export async function putContent(token: string, payload: unknown) {
  const response = await contentRoute.PUT(jsonRequest(`/x`, "PUT", payload), routeParams({ moderatorToken: token }));
  return { response, body: await response.json() };
}

export async function activate(token: string, questionId: number) {
  return activateRoute.POST(jsonRequest(`/x`, "POST", { questionId }), routeParams({ moderatorToken: token }));
}

export async function closeQuestion(token: string, questionId: number) {
  return closeQuestionRoute.POST(jsonRequest(`/x`, "POST", { questionId }), routeParams({ moderatorToken: token }));
}

export async function endPoll(token: string) {
  return endRoute.POST(jsonRequest(`/x`, "POST"), routeParams({ moderatorToken: token }));
}

export async function getPublic(code: string) {
  const response = await publicRoute.GET(jsonRequest(`/x`, "GET"), routeParams({ publicCode: code }));
  const text = await response.text();
  return { response, text, body: JSON.parse(text) };
}

export async function getFinal(code: string, participantId = "p1") {
  const response = await finalResultsRoute.GET(
    jsonRequest(`/api/polls/public/${code}/final-results?participantId=${participantId}`, "GET"),
    routeParams({ publicCode: code })
  );
  const text = await response.text();
  return { response, text, body: JSON.parse(text) };
}

export async function vote(code: string, questionId: number, optionId: number, participantId: string, ip?: string) {
  const response = await voteRoute.POST(
    jsonRequest(`/x`, "POST", { questionId, optionId, participantId }, ip),
    routeParams({ publicCode: code })
  );
  return { response, body: await response.json() };
}

/** Obsah z editoru převedený zpět na vstup PUT /content (beze změn). */
export function contentToPayload(content: {
  version: number;
  title: string | null;
  questions: { id: number; text: string; image: unknown; link: unknown; options: { id: number; text: string }[] }[];
}) {
  // Hluboká kopie — testy payload mutují a nesmí tím měnit zdrojový obsah.
  return structuredClone({
    version: content.version,
    title: content.title ?? undefined,
    questions: content.questions.map((q) => ({ id: q.id, text: q.text, image: q.image, link: q.link, options: q.options })),
  });
}
