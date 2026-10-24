import { LIMITS } from "../polls/limits.ts";

export type PreparedImage = { blob: Blob; previewUrl: string; width: number; height: number };
export type PrepareImageResult = { ok: true; image: PreparedImage } | { ok: false; error: string };

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode"));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Připraví obrázek k nahrání v prohlížeči (běží jen na klientu):
 * - ověří typ (JPEG/PNG/WebP/GIF; SVG nikdy) a že jde obrázek dekódovat
 *   (poškozený soubor se odmítne hned, ne až na serveru),
 * - velkou fotku zmenší na max. 2400 px delší strany a překóduje
 *   (WebP, fallback JPEG) — rychlé načtení na mobilech studentů a
 *   splnění 4MB limitu serveru. Menší obrázky posílá beze změny
 *   (žádná zbytečná ztráta kvality). GIF úložiště (Content API)
 *   nepřijímá, převede se proto vždy na statický obrázek (první snímek).
 * Server typ a velikost stejně ověřuje znovu.
 */
export async function prepareImage(file: File): Promise<PrepareImageResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, error: "Podporované formáty jsou JPEG, PNG, WebP a GIF." };
  }
  if (file.size > LIMITS.MAX_ORIGINAL_IMAGE_BYTES) {
    return { ok: false, error: `Soubor je příliš velký (max. ${LIMITS.MAX_ORIGINAL_IMAGE_BYTES / 1024 / 1024} MB).` };
  }

  const sourceUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await loadImage(sourceUrl);
  } catch {
    URL.revokeObjectURL(sourceUrl);
    return { ok: false, error: "Obrázek se nepodařilo načíst — soubor je poškozený nebo nepodporovaný." };
  }

  const { naturalWidth: width, naturalHeight: height } = image;
  const maxDimension = LIMITS.IMAGE_RESIZE_MAX_DIMENSION;
  const fitsAsIs = width <= maxDimension && height <= maxDimension && file.size <= LIMITS.MAX_IMAGE_BYTES;

  if (fitsAsIs && file.type !== "image/gif") {
    return { ok: true, image: { blob: file, previewUrl: sourceUrl, width, height } };
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(sourceUrl);
    return { ok: false, error: "Obrázek se nepodařilo zpracovat." };
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  URL.revokeObjectURL(sourceUrl);

  for (const quality of [0.9, 0.82, 0.72]) {
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    // Starší Safari WebP neumí zakódovat a vrátí PNG — pak JPEG.
    if (!blob || blob.type !== "image/webp") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.globalCompositeOperation = "source-over";
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }
    if (blob && blob.size <= LIMITS.MAX_IMAGE_BYTES) {
      return { ok: true, image: { blob, previewUrl: URL.createObjectURL(blob), width: targetWidth, height: targetHeight } };
    }
  }
  return { ok: false, error: "Obrázek se nepodařilo zmenšit pod 4 MB." };
}
