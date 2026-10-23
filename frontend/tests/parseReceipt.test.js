import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseReceipt } from "../src/features/receipts/parseReceipt.js";

// The *.ocr.txt fixtures are real Tesseract output for the matching *.png receipts (see ocr.integration.test.js).
const ocr = (name) =>
  fs.readFileSync(path.join(import.meta.dirname, "fixtures/receipts", `${name}.ocr.txt`), "utf8");

describe("receipt parser", () => {
  it("reads a simple shop receipt", () => {
    const result = parseReceipt(ocr("green-house"));
    expect(result).toMatchObject({
      merchant: "GREEN HOUSE MARKET",
      date: "2026-10-16",
      amountPence: 1450,
      taxPence: 0,
      confidence: "high",
      itemsMatchTotal: true,
    });
    expect(result.items).toEqual([
      { title: "Milk", amount: "2.50" },
      { title: "Bread", amount: "2.00" },
      { title: "Vegetables", amount: "10.00" },
    ]);
  });

  it("keeps discounts as negative lines and ignores card payment lines", () => {
    const result = parseReceipt(ocr("supermarket"));
    expect(result).toMatchObject({
      merchant: "FRESHWAY SUPERSTORE",
      date: "2026-10-21",
      receiptNumber: "0042-7781",
      amountPence: 679,
    });
    expect(result.items.at(-1)).toEqual({ title: "Multibuy saving", amount: "-0.50" });
    expect(result.items.map((item) => item.title)).not.toContain("VISA DEBIT");
    expect(result.itemsTotalPence).toBe(679);
  });

  it("understands 'total to pay', VAT and written-out dates", () => {
    const result = parseReceipt(ocr("cafe"));
    expect(result).toMatchObject({
      merchant: "THE CORNER CAFE",
      date: "2026-10-08",
      receiptNumber: "CF-2210",
      amountPence: 1515,
      taxPence: 253,
    });
    expect(result.items).toHaveLength(3);
  });

  it("copes with a noisy, skewed phone photo", () => {
    const result = parseReceipt(ocr("photo-skewed"));
    expect(result).toMatchObject({ merchant: "HOMEBASE DIY", date: "2026-09-30", amountPence: 2100 });
    // A line the OCR could not read means the items cannot add up; the member is told to check.
    expect(result.itemsMatchTotal).toBe(false);
    expect(result.items.find((item) => item.title.startsWith("Dust Sheet")).amount).toBe("4.50");
  });

  it("reads every line of a long till slip", () => {
    const result = parseReceipt(ocr("long-slip"));
    expect(result).toMatchObject({
      merchant: "ALDO SUPERMARKETS",
      date: "2026-10-15",
      receiptNumber: "8812-0045",
      amountPence: 3368,
      itemsMatchTotal: true,
    });
    expect(result.items).toHaveLength(15);
    expect(result.items.map((item) => item.title)).not.toContain("DEBIT CARD");
  });

  it("reads wide and shadowed phone photos once the image is cleaned", () => {
    expect(parseReceipt(ocr("wide-photo"))).toMatchObject({
      merchant: "TESCO EXPRESS",
      date: "2026-10-22",
      amountPence: 430,
      itemsMatchTotal: true,
    });
    expect(parseReceipt(ocr("shadow-photo"))).toMatchObject({
      merchant: "CORNER DELI",
      date: "2026-10-09",
      amountPence: 790,
      itemsMatchTotal: true,
    });
  });

  it("treats 'amount charged' and 'you paid' as the total (app and taxi receipts)", () => {
    expect(parseReceipt(ocr("lowres-screenshot"))).toMatchObject({
      merchant: "CITY TAXI LTD",
      date: "2026-10-21",
      amountPence: 1470,
      confidence: "high",
    });
    const paid = parseReceipt("Coffee 3.20\nYou paid £3.20\nVisa contactless 3.20");
    expect(paid).toMatchObject({ amountPence: 320, itemsMatchTotal: true });
    expect(paid.items).toEqual([{ title: "Coffee", amount: "3.20" }]);
  });

  it("re-attaches prices that the OCR put on their own line", () => {
    const result = parseReceipt("FARM SHOP\nBananas\n0.95\nMilk\n£1.20\nTOTAL\n2.15");
    expect(result.items).toEqual([
      { title: "Bananas", amount: "0.95" },
      { title: "Milk", amount: "1.20" },
    ]);
    expect(result).toMatchObject({ amountPence: 215, itemsMatchTotal: true });
  });

  it("finds receipt and transaction numbers", () => {
    expect(parseReceipt("Trans: 99812\nTOTAL 1.00").receiptNumber).toBe("99812");
    expect(parseReceipt("Receipt No: 8812-0045").receiptNumber).toBe("8812-0045");
  });

  it("prefers 'balance due' over a plain total and flags competing totals", () => {
    expect(parseReceipt("TOTAL 10.00\nBALANCE DUE 8.00").amountPence).toBe(800);
    const ambiguous = parseReceipt("TOTAL 10.00\nTOTAL 12.00");
    expect(ambiguous).toMatchObject({ ambiguous: true, confidence: "review" });
  });

  it("never treats change, cash tendered or subtotals as the total", () => {
    const result = parseReceipt("Item 4.00\nSUBTOTAL 4.00\nCASH TENDERED 10.00\nCHANGE 6.00\nTOTAL 4.00");
    expect(result.amountPence).toBe(400);
  });

  it("finds the amount on the next line and handles comma decimals", () => {
    expect(parseReceipt("AMOUNT DUE\n£ 23,45").amountPence).toBe(2345);
  });

  it("rejects impossible dates and returns empty suggestions for unreadable text", () => {
    expect(parseReceipt("Date 31/02/2026\nTOTAL 1.00").date).toBeNull();
    expect(parseReceipt("")).toMatchObject({
      amountPence: null,
      confidence: "none",
      items: [],
      merchant: "",
    });
  });
});
