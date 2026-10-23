import { cleanForOcr, scanSize } from "./receiptImage.js";

// Receipt file checks and preparation in the browser. The original file is uploaded unchanged; a copy resized for
// OCR is scanned, and the scanner also reads an evenly lit greyscale version of it (cleanedCopy).

export const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const HEIC_TYPES = ["image/heic", "image/heif"];
const EXTENSION_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  heic: "image/heic",
  heif: "image/heif",
};
const DECODE_TIMEOUT_MS = 20_000;

/** MIME type from the file, falling back to its extension (some phones send an empty or generic type). */
export function receiptType(file) {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return (
    EXTENSION_TYPES[
      String(file.name || "")
        .split(".")
        .pop()
        .toLowerCase()
    ] ?? ""
  );
}

/** Throws a user-facing error when the file cannot be stored as a receipt. */
export function assertUploadable(file) {
  const type = receiptType(file);
  if (file.size > MAX_RECEIPT_BYTES)
    throw new Error("Choose a receipt under 12 MB. Export a smaller photo if needed.");
  if (HEIC_TYPES.includes(type))
    throw new Error(
      "HEIC photos are not supported. Set your camera to “Most Compatible” (JPEG), or use Take photo.",
    );
  if (!UPLOAD_TYPES.includes(type)) throw new Error("Use a JPEG, PNG, WebP or PDF receipt.");
  return type;
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Fall back to <img> decoding below.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("The photo took too long to open. Try a smaller JPEG.")),
        DECODE_TIMEOUT_MS,
      );
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error("This photo could not be opened on this device. Export it as JPEG and try again."));
      };
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A canvas holding the cleanForOcr() version of a prepared scan image or a rendered PDF page, optionally drawn at
 * another size. The source is left as it was.
 * @param {Blob | HTMLCanvasElement} source
 * @param {{ width: number, height: number }} [size] defaults to the source's own size
 */
export async function cleanedCopy(source, size) {
  const image = source instanceof Blob ? await decodeImage(source) : source;
  try {
    const canvas = Object.assign(
      document.createElement("canvas"),
      size ?? { width: image.width || image.naturalWidth, height: image.height || image.naturalHeight },
    );
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This device could not prepare the photo. Try a smaller JPEG.");
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    cleanForOcr(pixels);
    context.putImageData(pixels, 0, 0);
    return canvas;
  } finally {
    if (image !== source) image.close?.();
  }
}

/**
 * Validates a chosen file and returns `{ original, scanInput, previewUrl }`. For PDFs the scan input is the PDF
 * itself and there is no image preview. The caller revokes previewUrl.
 */
export async function prepareReceipt(file) {
  const type = assertUploadable(file);
  const original = new File([file], file.name || "receipt", { type });
  if (type === "application/pdf") return { original, scanInput: original, previewUrl: null };

  const bitmap = await decodeImage(original);
  try {
    const size = scanSize(bitmap.width || bitmap.naturalWidth, bitmap.height || bitmap.naturalHeight);
    const canvas = Object.assign(document.createElement("canvas"), size);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This device could not prepare the photo. Try a smaller JPEG.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    // Lossless PNG: JPEG artefacts around small characters reduce OCR accuracy.
    const scanInput = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("This photo could not be prepared."))),
        "image/png",
      ),
    );
    canvas.width = canvas.height = 1;
    return { original, scanInput, previewUrl: URL.createObjectURL(original) };
  } finally {
    bitmap.close?.();
  }
}

export const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
