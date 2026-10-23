// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { decode, encode } from "fast-png";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bestReading, ocrPasses } from "../src/features/receipts/ocrReading.js";
import { cleanForOcr } from "../src/features/receipts/receiptImage.js";
import { TESSERACT_OPTIONS } from "../src/features/receipts/scanner.js";

// Real OCR: the same Tesseract engine, English model, image clean-up and page modes the browser uses, run on
// receipt images: shop slips, a long till roll, phone photos (skewed, wide with perspective, half in shadow) and a
// small app screenshot. UPDATE_OCR_FIXTURES=1 refreshes the *.ocr.txt files used by the fast parser tests.

const require = createRequire(import.meta.url);
const fixtures = path.join(import.meta.dirname, "fixtures/receipts");
const languageData = path.join(
  path.dirname(require.resolve("@tesseract.js-data/eng/package.json")),
  "4.0.0_best_int",
);

const EXPECTED = {
  "green-house": { merchant: "GREEN HOUSE MARKET", date: "2026-10-16", amountPence: 1450, items: 3 },
  supermarket: { merchant: "FRESHWAY SUPERSTORE", date: "2026-10-21", amountPence: 679, items: 6 },
  cafe: { merchant: "THE CORNER CAFE", date: "2026-10-08", amountPence: 1515, items: 3 },
  "photo-skewed": { merchant: "HOMEBASE DIY", date: "2026-09-30", amountPence: 2100 },
  "long-slip": { merchant: "ALDO SUPERMARKETS", date: "2026-10-15", amountPence: 3368, items: 15 },
  "wide-photo": { merchant: "TESCO EXPRESS", date: "2026-10-22", amountPence: 430, items: 4 },
  "shadow-photo": { merchant: "CORNER DELI", date: "2026-10-09", amountPence: 790, items: 3 },
  "lowres-screenshot": { merchant: "CITY TAXI LTD", date: "2026-10-21", amountPence: 1470 },
};

/** An 8-bit RGB PNG cleaned as the browser does before OCR (resizing needs a canvas, so it is not done here). */
function cleaned(original) {
  const png = decode(original);
  const pixels = png.width * png.height;
  const data = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = png.data[p * png.channels + c];
    data[p * 4 + 3] = 255;
  }
  const image = { data, width: png.width, height: png.height };
  cleanForOcr(image);
  return Buffer.from(encode({ ...image, channels: 4 }));
}

describe("receipt OCR with the real engine", () => {
  let worker;

  beforeAll(async () => {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("eng", TESSERACT_OPTIONS.oem, {
      langPath: languageData,
      cachePath: os.tmpdir(),
    });
    await worker.setParameters(TESSERACT_OPTIONS.parameters);
  }, 60_000);

  afterAll(() => worker?.terminate());

  for (const [name, expected] of Object.entries(EXPECTED))
    it(`reads ${name}.png`, async () => {
      const original = fs.readFileSync(path.join(fixtures, `${name}.png`));
      const result = await bestReading(
        ocrPasses(cleaned(original), original),
        async ({ image, pageMode }) => {
          await worker.setParameters({ tessedit_pageseg_mode: pageMode });
          return (await worker.recognize(image, { rotateAuto: true })).data.text;
        },
      );
      if (process.env.UPDATE_OCR_FIXTURES)
        fs.writeFileSync(path.join(fixtures, `${name}.ocr.txt`), result.text);

      const { items, ...fields } = expected;
      expect(result).toMatchObject({ ...fields, confidence: "high" });
      // Where every item line is legible, the items must add up to the total.
      if (items) expect(result).toMatchObject({ items: { length: items }, itemsMatchTotal: true });
    }, 120_000);
});
