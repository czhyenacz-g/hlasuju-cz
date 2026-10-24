import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { pollImages, questions } from "../../db/schema.ts";
import { getImageStorage, ImageStorageError, type ImageStorage } from "./storage.ts";

export type DeleteImagesResult = { deleted: number; stoppedBy: ImageStorageError["kind"] | null };

/**
 * Smaže soubory v Content API a označí je v evidenci (deleted_at).
 * Zastaví se u první chyby (typicky rate limit Content API) — zbytek
 * dočistí příští běh cronu, nikdy se nic neztratí z evidence.
 */
export async function deletePollImageRows(storage: ImageStorage, rows: { id: number; storageId: string }[]): Promise<DeleteImagesResult> {
  const db = getDb();
  let deleted = 0;
  for (const row of rows) {
    try {
      await storage.delete(row.storageId);
    } catch (error) {
      if (!(error instanceof ImageStorageError)) throw error;
      console.error("Mazání obrázku v Content API selhalo (dočistí cron):", error.message);
      return { deleted, stoppedBy: error.kind };
    }
    await db.update(pollImages).set({ deletedAt: new Date() }).where(eq(pollImages.id, row.id));
    deleted++;
  }
  return { deleted, stoppedBy: null };
}

/** Úklid souboru, který se nepovedlo zapsat do evidence. */
export async function deleteStoredImagesQuietly(storage: ImageStorage, storageIds: string[]): Promise<void> {
  for (const id of storageIds) {
    try {
      await storage.delete(id);
    } catch (error) {
      console.error("Úklid obrázku v Content API selhal:", error instanceof Error ? error.message : error);
    }
  }
}

/**
 * Best-effort smazání obrázků, které po uložení obsahu hlasování už nic
 * nepoužívá (nahrazený/odebraný obrázek, smazaná otázka). Před smazáním
 * se znovu ověří, že na URL neodkazuje žádná otázka. Co se nepovede
 * (výpadek, rate limit Content API), dočistí denní cron.
 */
export async function deleteUnusedPollImagesQuietly(pollId: number, urls: string[]): Promise<void> {
  const storage = getImageStorage();
  if (!storage || urls.length === 0) return;
  try {
    const db = getDb();
    const candidates = await db
      .select({ id: pollImages.id, storageId: pollImages.storageId, url: pollImages.url })
      .from(pollImages)
      .where(and(eq(pollImages.pollId, pollId), inArray(pollImages.url, urls), isNull(pollImages.deletedAt)));
    if (candidates.length === 0) return;
    const stillUsed = new Set(
      (
        await db
          .select({ url: questions.imageUrl })
          .from(questions)
          .where(inArray(questions.imageUrl, candidates.map((row) => row.url)))
      ).map((row) => row.url)
    );
    await deletePollImageRows(
      storage,
      candidates.filter((row) => !stillUsed.has(row.url))
    );
  } catch (error) {
    console.error("Mazání nepoužitých obrázků selhalo (dočistí cron):", error instanceof Error ? error.message : error);
  }
}
