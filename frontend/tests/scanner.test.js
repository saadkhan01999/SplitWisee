import { describe, expect, it } from "vitest";
import { languageFileProblem } from "../src/features/receipts/scanner.js";

const model = () => {
  const bytes = new Uint8Array(2_952_873);
  bytes.set([0x1f, 0x8b]);
  return bytes;
};

describe("receipt scanner language file check", () => {
  it("accepts the gzip-compressed English model", () => {
    expect(
      languageFileProblem({ status: 200, contentType: "application/octet-stream", bytes: model() }),
    ).toBeNull();
  });

  it("names a download manager when the file arrives empty (IDM answers HTTP 204)", () => {
    const empty = new Uint8Array(0);
    expect(languageFileProblem({ status: 204, contentType: "", bytes: empty })).toMatch(
      /download manager.*HTTP 204.*Internet Download Manager/,
    );
    expect(languageFileProblem({ status: 200, contentType: "", bytes: empty })).toMatch(/arrived empty/);
  });

  it("explains a web page, an error status or a damaged file", () => {
    const page = new TextEncoder().encode("<!doctype html><html></html>");
    expect(languageFileProblem({ status: 200, contentType: "text/html", bytes: page })).toMatch(/web page/);
    expect(languageFileProblem({ status: 404, contentType: "text/plain", bytes: page })).toMatch(/HTTP 404/);
    expect(
      languageFileProblem({
        status: 200,
        contentType: "application/octet-stream",
        bytes: model().slice(0, 5000),
      }),
    ).toMatch(/arrived damaged \(5,000 bytes\)/);
  });
});
