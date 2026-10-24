export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export type ImageInfo = { mimeType: ImageMimeType; extension: string; width: number; height: number };

/**
 * Zjistí skutečný typ a rozměry obrázku z jeho hlavičky (magic bytes),
 * bez ohledu na příponu nebo Content-Type od klienta. Vrací null pro
 * cokoli jiného než JPEG/PNG/WebP/GIF — mimo jiné pro SVG (XSS riziko)
 * a pro soubory s poškozenou/useknutou hlavičkou.
 *
 * Čistá funkce bez závislostí (žádný sharp), aby upload zůstal levný.
 * Plné dekódování pixelů nedělá — poškozená data za platnou hlavičkou
 * odhalí až prohlížeč (editor obrázek před nahráním dekóduje).
 */
export function inspectImage(bytes: Uint8Array): ImageInfo | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes) ?? inspectGif(bytes);
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function valid(info: ImageInfo): ImageInfo | null {
  return info.width > 0 && info.height > 0 ? info : null;
}

function inspectPng(bytes: Uint8Array): ImageInfo | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
  return valid({ mimeType: "image/png", extension: "png", width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) });
}

function inspectGif(bytes: Uint8Array): ImageInfo | null {
  const header = ascii(bytes, 0, 6);
  if ((header !== "GIF87a" && header !== "GIF89a") || bytes.length < 10) return null;
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  return valid({ mimeType: "image/gif", extension: "gif", width, height });
}

function inspectWebp(bytes: Uint8Array): ImageInfo | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8 " && bytes.length >= 30) {
    // Lossy: klíčový snímek začíná start kódem 9d 01 2a.
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return valid({ mimeType: "image/webp", extension: "webp", width, height });
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    if (bytes[20] !== 0x2f) return null;
    const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
    return valid({ mimeType: "image/webp", extension: "webp", width, height });
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return valid({ mimeType: "image/webp", extension: "webp", width, height });
  }
  return null;
}

// SOF markery nesoucí rozměry (C0–CF kromě DHT C4, JPG C8 a DAC CC).
function isStartOfFrame(marker: number) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function inspectJpeg(bytes: Uint8Array): ImageInfo | null {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1];
    // Výplňové 0xFF před markerem.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset++;
      marker = bytes[offset + 1];
    }
    // Markery bez délky (RSTn, TEM) — v hlavičce by být neměly, přeskočit.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    // Začátek obrazových dat nebo konec souboru bez SOF = poškozený soubor.
    if (marker === 0xda || marker === 0xd9) return null;

    const length = readUint16BE(bytes, offset + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) return null;
      const height = readUint16BE(bytes, offset + 5);
      const width = readUint16BE(bytes, offset + 7);
      return valid({ mimeType: "image/jpeg", extension: "jpg", width, height });
    }
    offset += 2 + length;
  }
  return null;
}
