import { brand } from "../config/brand.js";

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the system share sheet with the file when supported (phones), otherwise downloads it. */
export async function shareBlob(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: brand.name, text });
    return;
  }
  saveBlob(blob, filename);
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export const jsonBlob = (value) => new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });

export function safeFilename(value, fallback = "file") {
  return (
    String(value || "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || fallback
  );
}

/**
 * Descriptive export file names: "CoinSplit-Willow-House-Closing-sheet-2026-10-01-to-2026-10-31.pdf".
 * Parts are kept to letters, digits and hyphens so every file system and mail client accepts them.
 */
export function exportFilename({ household, document, start, end, ext }) {
  const range = start && end ? `${start}-to-${end}` : start || "";
  return [brand.name, household && safeFilename(household), safeFilename(document), range]
    .filter(Boolean)
    .join("-")
    .concat(`.${ext}`);
}
