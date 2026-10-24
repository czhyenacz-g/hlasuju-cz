import "server-only";

/**
 * Úložiště obrázků = Universal Content API (https://content-api.darbujan.com,
 * repo universal-content-api, docs/API.md → Media). Jediné místo, které na
 * něj sahá. Token je jen v serverové env proměnné CONTENT_API_TOKEN a nikdy
 * neodchází do prohlížeče — prohlížeč nahrává na náš endpoint
 * (/api/polls/moderator/<token>/images), ten ověří moderátora a teprve
 * potom posílá soubor dál.
 *
 * Content API soubor znovu ověří (finfo + dekódování), zmenší na max.
 * 2560 px, překóduje do WebP (zahodí EXIF vč. GPS) a vrátí veřejnou URL
 * bez schvalování (projekt má výchozí viditelnost public).
 */

const DEFAULT_BASE_URL = "https://content-api.darbujan.com";
const DEFAULT_PROJECT = "hlasuju";
const UPLOAD_TIMEOUT_MS = 20_000;
const DELETE_TIMEOUT_MS = 8_000;

export type StoredImage = { id: string; url: string; width: number; height: number };

export type ImageStorage = {
  upload(bytes: Uint8Array, contentType: string, meta: { pollId: number }): Promise<StoredImage>;
  /** Idempotentní — už smazané/neexistující médium není chyba. */
  delete(id: string): Promise<void>;
};

/**
 * - unavailable: Content API neodpovídá / 5xx / timeout,
 * - busy: rate limit Content API (sdílený pro celé Hlasuju), retryAfter v s,
 * - rejected: Content API soubor odmítlo jako neplatný obrázek,
 * - misconfigured: špatný token/scope/projekt nebo neveřejné médium.
 */
export class ImageStorageError extends Error {
  readonly kind: "unavailable" | "busy" | "rejected" | "misconfigured";
  readonly retryAfterSeconds?: number;

  constructor(kind: ImageStorageError["kind"], message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ImageStorageError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type ContentApiConfig = { baseUrl: string; project: string; token: string };

function readConfig(): ContentApiConfig | null {
  const token = process.env.CONTENT_API_TOKEN;
  if (!token) return null;
  return {
    baseUrl: (process.env.CONTENT_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    project: process.env.CONTENT_API_PROJECT || DEFAULT_PROJECT,
    token,
  };
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function retryAfter(response: Response): number {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 60;
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "síťová chyba";
    throw new ImageStorageError("unavailable", `Content API nedostupné (${reason}).`);
  }
}

function failure(response: Response, action: string): ImageStorageError {
  if (response.status === 429) {
    return new ImageStorageError("busy", `Content API ${action}: rate limit.`, retryAfter(response));
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return new ImageStorageError("misconfigured", `Content API ${action}: HTTP ${response.status} (token/scope/projekt).`);
  }
  if (response.status === 413 || response.status === 422) {
    return new ImageStorageError("rejected", `Content API ${action}: soubor odmítnut (HTTP ${response.status}).`);
  }
  return new ImageStorageError("unavailable", `Content API ${action}: HTTP ${response.status}.`);
}

function contentApiStorage(config: ContentApiConfig): ImageStorage {
  const mediaUrl = `${config.baseUrl}/api/v1/projects/${encodeURIComponent(config.project)}/media`;
  const headers = { authorization: `Bearer ${config.token}`, accept: "application/json" };

  return {
    async upload(bytes, contentType, meta) {
      const form = new FormData();
      form.append("file", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }), `obrazek.${EXTENSIONS[contentType] ?? "bin"}`);
      form.append("visibility", "public");
      // Interní metadata — v Content API se nikdy veřejně nezobrazují,
      // slouží jen adminovi k dohledání, odkud soubor je.
      form.append("metadata[source]", "hlasuju");
      form.append("metadata[poll_id]", String(meta.pollId));

      const response = await request(mediaUrl, { method: "POST", headers, body: form }, UPLOAD_TIMEOUT_MS);
      if (response.status !== 201) throw failure(response, "upload");

      const body = (await response.json().catch(() => null)) as {
        data?: { uuid?: unknown; public_url?: unknown; is_public?: unknown; width?: unknown; height?: unknown };
      } | null;
      const data = body?.data;
      if (!data || typeof data.uuid !== "string" || typeof data.width !== "number" || typeof data.height !== "number") {
        throw new ImageStorageError("unavailable", "Content API upload: neočekávaná odpověď.");
      }
      // Fail-closed: médium musí být veřejné a servírované z Content API
      // (jinak by u otázky skončila nefunkční nebo cizí URL).
      if (data.is_public !== true || typeof data.public_url !== "string" || !data.public_url.startsWith(`${config.baseUrl}/`)) {
        // Uklidit, ať nezůstane neevidovaný soubor.
        await request(`${mediaUrl}/${encodeURIComponent(data.uuid)}`, { method: "DELETE", headers }, DELETE_TIMEOUT_MS).catch(() => {});
        throw new ImageStorageError("misconfigured", "Content API upload: médium není veřejné (zkontrolujte default_visibility projektu).");
      }
      return { id: data.uuid, url: data.public_url, width: data.width, height: data.height };
    },

    async delete(id) {
      const response = await request(`${mediaUrl}/${encodeURIComponent(id)}`, { method: "DELETE", headers }, DELETE_TIMEOUT_MS);
      // 404 = médium už neexistuje (nebo nikdy nebylo tohoto projektu) —
      // pro nás je to stejné jako úspěšné smazání.
      if (response.ok || response.status === 404) return;
      throw failure(response, "delete");
    },
  };
}

/** null = úložiště obrázků není nakonfigurované (chybí CONTENT_API_TOKEN). */
export function getImageStorage(): ImageStorage | null {
  const config = readConfig();
  return config ? contentApiStorage(config) : null;
}

export function isImageStorageConfigured(): boolean {
  return readConfig() !== null;
}
