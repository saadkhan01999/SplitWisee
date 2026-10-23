import { describe, expect, it } from "vitest";
import { cleanForOcr, enlargedSize, scanSize } from "../src/features/receipts/receiptImage.js";

/** A receipt-like RGBA image: rows of dark "text" on paper that fades from bright (left) to shadow (right). */
function shadowedReceipt(width = 400, height = 100) {
  const data = new Uint8ClampedArray(width * height * 4);
  const isText = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const paper = 250 - (180 * x) / (width - 1);
      isText[p] = (y % 10 === 4 || y % 10 === 5) && x % 8 < 4;
      data.fill(isText[p] ? paper * 0.35 : paper, p * 4, p * 4 + 3);
      data[p * 4 + 3] = 255;
    }
  return { image: { data, width, height }, isText };
}

const range = (values) => [Math.min(...values), Math.max(...values)];

describe("receipt image clean-up", () => {
  it("scans large photos at about 6 megapixels without distorting them", () => {
    expect(scanSize(4000, 3000)).toEqual({ width: 2828, height: 2121 });
    expect(scanSize(3024, 4032)).toEqual({ width: 2121, height: 2828 });
  });

  it("keeps long till slips readable instead of shrinking them by their long edge", () => {
    expect(scanSize(1000, 4800)).toEqual({ width: 1000, height: 4800 });
    expect(scanSize(1200, 9000).height).toBe(5000);
  });

  it("scans small images as they are, and offers an enlarged size only for a last attempt", () => {
    expect(scanSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(enlargedSize(800, 600)).toEqual({ width: 1600, height: 1200 });
    expect(enlargedSize(300, 200)).toEqual({ width: 750, height: 500 }); // at most 2.5×
    expect(enlargedSize(2000, 1500)).toBeNull();
  });

  it("evens out a shadow so one threshold separates text from paper", () => {
    const { image, isText } = shadowedReceipt();
    const grey = (data) => Array.from({ length: isText.length }, (_, p) => data[p * 4]);
    const before = grey(image.data);
    // Before: text on the bright side is lighter than paper in the shadow, so no single threshold works.
    expect(range(before.filter((_, p) => isText[p]))[1]).toBeGreaterThan(
      range(before.filter((_, p) => !isText[p]))[0],
    );

    cleanForOcr(image);
    const after = grey(image.data);
    expect(range(after.filter((_, p) => isText[p]))[1]).toBeLessThan(80);
    expect(range(after.filter((_, p) => !isText[p]))[0]).toBeGreaterThan(180);
  });

  it("returns opaque greyscale pixels", () => {
    const { image } = shadowedReceipt(40, 20);
    image.data[3] = 0;
    cleanForOcr(image);
    for (let i = 0; i < image.data.length; i += 4) {
      expect(image.data[i + 1]).toBe(image.data[i]);
      expect(image.data[i + 2]).toBe(image.data[i]);
      expect(image.data[i + 3]).toBe(255);
    }
  });
});
