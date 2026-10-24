import "server-only";
import { getDb } from "../../db/index.ts";
import { pollImages } from "../../db/schema.ts";
import { LIMITS } from "../polls/limits.ts";
import { inspectImage } from "./inspect-image.ts";
import { deleteStoredImagesQuietly } from "./poll-images.ts";
import { getImageStorage, ImageStorageError } from "./storage.ts";

export type StoreImageResult =
  | { ok: true; image: { url: string; width: number; height: number } }
  | {
      ok: false;
      reason:
        | "storage_not_configured"
        | "storage_unavailable"
        | "storage_busy"
        | "too_large"
        | "unsupported"
        | "too_many_pixels";
      retryAfterSeconds?: number;
    };

// Content API přijímá jen JPEG/PNG/WebP (GIF ne) — editor GIF předem
// převede na statický WebP, server ho přímo nepřijme.
const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Ověří obrázek podle obsahu (ne podle přípony/Content-Type klienta),
 * pošle ho do Content API a zapíše do evidence poll_images. K otázce se
 * přiřadí až uložením obsahu v editoru; nahrané, ale nikdy neuložené
 * soubory smaže denní cron.
 *
 * Kontrola tady šetří limit Content API (sdílený pro celé Hlasuju) —
 * zjevně neplatný soubor tam vůbec nepošleme.
 */
export async function storeQuestionImage(pollId: number, bytes: Uint8Array): Promise<StoreImageResult> {
  const storage = getImageStorage();
  if (!storage) return { ok: false, reason: "storage_not_configured" };
  if (bytes.byteLength > LIMITS.MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };

  const info = inspectImage(bytes);
  if (!info || !SUPPORTED.has(info.mimeType)) return { ok: false, reason: "unsupported" };
  if (info.width > LIMITS.MAX_IMAGE_DIMENSION || info.height > LIMITS.MAX_IMAGE_DIMENSION) {
    return { ok: false, reason: "too_many_pixels" };
  }

  let stored;
  try {
    stored = await storage.upload(bytes, info.mimeType, { pollId });
  } catch (error) {
    if (!(error instanceof ImageStorageError)) throw error;
    console.error("Upload obrázku do Content API selhal:", error.message);
    switch (error.kind) {
      case "busy":
        return { ok: false, reason: "storage_busy", retryAfterSeconds: error.retryAfterSeconds };
      case "rejected":
        return { ok: false, reason: "unsupported" };
      default:
        return { ok: false, reason: "storage_unavailable" };
    }
  }

  try {
    await getDb().insert(pollImages).values({
      pollId,
      storageId: stored.id,
      url: stored.url,
      width: stored.width,
      height: stored.height,
    });
  } catch (error) {
    // Bez záznamu v evidenci by soubor nešel uložit k otázce ani uklidit.
    await deleteStoredImagesQuietly(storage, [stored.id]);
    throw error;
  }

  // Rozměry podle Content API (po případném zmenšení na jeho straně).
  return { ok: true, image: { url: stored.url, width: stored.width, height: stored.height } };
}
