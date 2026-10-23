import { describe, expect, it } from "vitest";
import { bestReading, isConvincing, ocrPasses, PAGE_MODES } from "../src/features/receipts/ocrReading.js";
import { parseReceipt } from "../src/features/receipts/parseReceipt.js";

/** A fake OCR pass that returns the given text for each page mode and records which modes ran. */
function fakeOcr(textByMode) {
  const modes = [];
  const readText = async (mode) => {
    modes.push(mode);
    return textByMode[mode] ?? "";
  };
  return { readText, modes };
}

describe("choosing the best OCR reading", () => {
  it("reads the cleaned image in every page mode, then the image as it was, then an enlarged copy", () => {
    expect(ocrPasses("cleaned", "original", "enlarged")).toEqual([
      { image: "cleaned", pageMode: "6" },
      { image: "cleaned", pageMode: "4" },
      { image: "cleaned", pageMode: "11" },
      { image: "original", pageMode: "6" },
      { image: "enlarged", pageMode: "6" },
    ]);
    expect(ocrPasses("cleaned", "original", null)).toHaveLength(4);
  });

  it("stops after the first pass when the items add up to the total", async () => {
    const { readText, modes } = fakeOcr({ 6: "Milk 2.50\nBread 2.00\nTOTAL 4.50" });
    const reading = await bestReading(PAGE_MODES, readText);
    expect(reading).toMatchObject({ amountPence: 450, itemsMatchTotal: true });
    expect(modes).toEqual(["6"]);
  });

  it("tries the next pass when the first finds no total", async () => {
    const { readText, modes } = fakeOcr({ 6: "Milk\nBread", 4: "Milk 2.50\nBread 2.00\nTOTAL 4.50" });
    expect((await bestReading(PAGE_MODES, readText)).amountPence).toBe(450);
    expect(modes).toEqual(["6", "4"]);
  });

  it("keeps the most useful reading when none is convincing", async () => {
    const { readText, modes } = fakeOcr({ 6: "", 4: "VISA 5.00", 11: "SHOP" });
    const reading = await bestReading(PAGE_MODES, readText);
    expect(reading).toMatchObject({ amountPence: 500, confidence: "review" });
    expect(modes).toEqual(PAGE_MODES);
  });

  it("does not stop at competing totals", () => {
    expect(isConvincing(parseReceipt("TOTAL 10.00\nTOTAL 12.00"))).toBe(false);
    expect(isConvincing(parseReceipt("AMOUNT DUE 8.00"))).toBe(true);
    expect(isConvincing(parseReceipt("nothing to read"))).toBe(false);
  });
});
