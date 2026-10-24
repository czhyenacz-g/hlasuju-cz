import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { inspectImage } from "../lib/images/inspect-image.ts";
import { gifBytes, jpegBytes, pngBytes, webpVp8xBytes } from "./helpers/db.ts";

describe("inspectImage — typ a rozměry podle obsahu", () => {
  test("rozpozná PNG, JPEG, WebP (VP8X) a GIF", () => {
    assert.deepEqual(inspectImage(pngBytes(1920, 1080)), { mimeType: "image/png", extension: "png", width: 1920, height: 1080 });
    assert.deepEqual(inspectImage(jpegBytes(4032, 3024)), { mimeType: "image/jpeg", extension: "jpg", width: 4032, height: 3024 });
    assert.deepEqual(inspectImage(webpVp8xBytes(2400, 1600)), { mimeType: "image/webp", extension: "webp", width: 2400, height: 1600 });
    assert.deepEqual(inspectImage(gifBytes(320, 240)), { mimeType: "image/gif", extension: "gif", width: 320, height: 240 });
  });

  test("odmítne SVG, HTML, prázdný a nulové rozměry", () => {
    assert.equal(inspectImage(new TextEncoder().encode("<svg></svg>")), null);
    assert.equal(inspectImage(new TextEncoder().encode("<!doctype html><img src=x onerror=alert(1)>")), null);
    assert.equal(inspectImage(new Uint8Array()), null);
    assert.equal(inspectImage(pngBytes(0, 100)), null);
  });

  test("JPEG bez SOF před daty obrazu = poškozený", () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    assert.equal(inspectImage(broken), null);
  });
});
