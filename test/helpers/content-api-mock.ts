import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { inspectImage } from "../../lib/images/inspect-image.ts";

export const MOCK_CONTENT_API_TOKEN = "uca_test_only_not_a_real_token";
const PROJECT = "hlasuju";

export type MockMedia = { id: number; uuid: string; bytes: Uint8Array; contentType: string; metadata: Record<string, string>; deleted: boolean };
export type MockMode = "ok" | "down" | "busy" | "unauthorized" | "private";

/**
 * Mock Universal Content API (jen to, co Hlasuju používá) — skutečný HTTP
 * server na 127.0.0.1, takže testy jdou přes opravdový klient
 * lib/images/storage.ts (fetch, multipart, hlavičky, chybové stavy).
 * Tvar odpovědí podle universal-content-api docs/API.md → Media.
 */
export async function startMockContentApi(port = 0) {
  const media = new Map<string, MockMedia>();
  const requests: { method: string; path: string; authorization: string | undefined }[] = [];
  let nextId = 1;
  let mode: MockMode = "ok";
  let failDeletesAfter = Infinity;

  async function readBody(req: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    requests.push({ method: req.method ?? "", path: url.pathname, authorization: req.headers.authorization });
    const body = await readBody(req);

    const publicMatch = url.pathname.match(/^\/media\/(\d+)$/);
    if (req.method === "GET" && publicMatch) {
      const item = [...media.values()].find((m) => m.id === Number(publicMatch[1]) && !m.deleted);
      if (!item || mode === "down") return json(res, 404, { error: { code: "not_found" } });
      res.writeHead(200, { "content-type": item.contentType, "cache-control": "public, max-age=31536000, immutable" });
      return res.end(Buffer.from(item.bytes));
    }

    if (mode === "down") return json(res, 500, { error: { code: "server_error", message: "boom" } });
    if (mode === "busy") return json(res, 429, { error: { code: "rate_limited", message: "Too Many Attempts." } }, { "retry-after": "7" });
    if (mode === "unauthorized" || req.headers.authorization !== `Bearer ${MOCK_CONTENT_API_TOKEN}`) {
      return json(res, 401, { error: { code: "unauthenticated" } });
    }

    const base = `/api/v1/projects/${PROJECT}/media`;
    if (req.method === "POST" && url.pathname === base) {
      const form = await new Request("http://mock", { method: "POST", headers: { "content-type": req.headers["content-type"] ?? "" }, body }).formData();
      const file = form.get("file");
      if (!file || typeof file === "string") return json(res, 422, { error: { code: "validation_failed" } });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = inspectImage(bytes);
      if (!info || info.mimeType === "image/gif") return json(res, 422, { error: { code: "validation_failed" } });
      const metadata: Record<string, string> = {};
      for (const [key, value] of form.entries()) {
        const match = key.match(/^metadata\[(\w+)\]$/);
        if (match && typeof value === "string") metadata[match[1]] = value;
      }
      const item: MockMedia = { id: nextId++, uuid: randomUUID(), bytes, contentType: info.mimeType, metadata, deleted: false };
      media.set(item.uuid, item);
      // Content API zmenšuje na max. 2560 px delší strany.
      const scale = Math.min(1, 2560 / Math.max(info.width, info.height));
      const isPublic = mode !== "private" && form.get("visibility") === "public";
      return json(res, 201, {
        data: {
          id: item.id,
          uuid: item.uuid,
          visibility: isPublic ? "public" : "private",
          is_public: isPublic,
          public_url: isPublic ? `${baseUrl}/media/${item.id}` : null,
          mime_type: "image/webp",
          size_bytes: bytes.byteLength,
          width: Math.round(info.width * scale),
          height: Math.round(info.height * scale),
        },
      });
    }

    const deleteMatch = url.pathname.match(new RegExp(`^${base}/([0-9a-f-]+)$`));
    if (req.method === "DELETE" && deleteMatch) {
      if (failDeletesAfter <= 0) return json(res, 429, { error: { code: "rate_limited" } }, { "retry-after": "60" });
      failDeletesAfter--;
      const item = media.get(deleteMatch[1]);
      if (!item) return json(res, 404, { error: { code: "not_found" } });
      const already = item.deleted;
      item.deleted = true;
      return json(res, 200, { data: { id: item.id, uuid: item.uuid, already_deleted: already, file_deleted: true, pending: false } });
    }

    return json(res, 404, { error: { code: "not_found" } });
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const previousEnv = {
    url: process.env.CONTENT_API_URL,
    token: process.env.CONTENT_API_TOKEN,
    project: process.env.CONTENT_API_PROJECT,
  };
  process.env.CONTENT_API_URL = baseUrl;
  process.env.CONTENT_API_TOKEN = MOCK_CONTENT_API_TOKEN;
  process.env.CONTENT_API_PROJECT = PROJECT;

  return {
    baseUrl,
    media,
    requests,
    setMode(next: MockMode) {
      mode = next;
    },
    /** Po N úspěšných DELETE začne vracet 429 (rate limit Content API). */
    limitDeletes(count: number) {
      failDeletesAfter = count;
    },
    liveMedia() {
      return [...media.values()].filter((item) => !item.deleted);
    },
    async close() {
      for (const [key, value] of Object.entries({
        CONTENT_API_URL: previousEnv.url,
        CONTENT_API_TOKEN: previousEnv.token,
        CONTENT_API_PROJECT: previousEnv.project,
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export type MockContentApi = Awaited<ReturnType<typeof startMockContentApi>>;
