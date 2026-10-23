import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

const browser = typeof window !== "undefined";

beforeEach(() => {
  if (!browser) return;
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  // jsdom does not implement scrolling or object URLs.
  window.scrollTo = vi.fn();
  URL.createObjectURL ??= vi.fn(() => "blob:test");
  URL.revokeObjectURL ??= vi.fn();
});

afterEach(() => {
  if (browser) cleanup();
  vi.unstubAllGlobals();
});
