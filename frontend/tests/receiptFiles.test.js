import { describe, expect, it } from "vitest";
import { assertUploadable, receiptType } from "../src/features/receipts/receiptFiles.js";

const file = (name, type, size = 1000) => ({ name, type, size });

describe("receipt files", () => {
  it("accepts JPEG, PNG, WebP and PDF up to 12 MB", () => {
    for (const [name, type] of [
      ["a.jpg", "image/jpeg"],
      ["b.png", "image/png"],
      ["c.webp", "image/webp"],
      ["d.pdf", "application/pdf"],
    ])
      expect(assertUploadable(file(name, type))).toBe(type);
  });

  it("works out the type from the extension when the phone sends none", () => {
    expect(receiptType(file("IMG_0001.JPG", ""))).toBe("image/jpeg");
    expect(receiptType(file("bill.pdf", "application/octet-stream"))).toBe("application/pdf");
  });

  it("rejects HEIC, other formats and oversized files with a clear message", () => {
    expect(() => assertUploadable(file("IMG_0002.HEIC", ""))).toThrow(/HEIC photos are not supported/);
    expect(() => assertUploadable(file("notes.txt", "text/plain"))).toThrow(
      "Use a JPEG, PNG, WebP or PDF receipt.",
    );
    expect(() => assertUploadable(file("big.jpg", "image/jpeg", 12 * 1024 * 1024 + 1))).toThrow(
      /under 12 MB/,
    );
  });
});
