import { bestReading, ocrPasses } from "./ocrReading.js";
import { parseReceipt } from "./parseReceipt.js";
import { cleanedCopy } from "./receiptFiles.js";
import { enlargedSize } from "./receiptImage.js";

// In-browser receipt OCR. Images go to Tesseract; PDFs use their text layer when present and are rendered and
// OCR'd when scanned. Nothing is sent to a third party: the engine files are served from /ocr/ on this site.

const SCAN_TIMEOUT_MS = 120_000;
const MAX_PDF_PAGES = 6;
const PDF_RENDER_SCALE = 2.5;
/** Tesseract's loading statuses, in order. */
const LOADING_STAGES = [
  "loading tesseract core",
  "initializing tesseract",
  "loading language traineddata",
  "initializing api",
];

/** Tesseract settings shared with the OCR integration test. */
export const TESSERACT_OPTIONS = {
  oem: 1, // LSTM neural network only (the bundled English model)
  parameters: { preserve_interword_spaces: "1" },
};

export class ScanStopped extends Error {
  constructor(message = "Scanning stopped. Try again with a clear photo, or enter the amount yourself.") {
    super(message);
    this.name = "ScanStopped";
  }
}

const ocrBase = () => new URL("/ocr/", window.location.origin).href;
/** The English model, published without ".gz" (see vite/ocrAssets.js) but still gzip-compressed. */
const LANGUAGE_FILE = "eng.traineddata";
const MIN_LANGUAGE_BYTES = 1_000_000;

/**
 * What is wrong with the language file this browser received, as a message for the member, or null when it looks
 * right. Tesseract accepts any successful response, so an empty or substituted file only shows up later as
 * "initialization failed".
 * @param {{ status: number, contentType: string, bytes: Uint8Array }} response
 */
export function languageFileProblem({ status, contentType, bytes }) {
  if (status === 204 || (status === 200 && bytes.length === 0))
    return (
      `A download manager or browser extension blocked the scanner's language file (it arrived empty, HTTP ${status}). ` +
      "If you use Internet Download Manager (IDM) or a similar tool, add this site to its exceptions or turn off its " +
      "browser integration, then try again."
    );
  if (status !== 200)
    return `The scanner's language file could not be downloaded (HTTP ${status}). Try again later.`;
  if (/html/i.test(contentType) || bytes[0] === 0x3c)
    return "The server sent a web page instead of the scanner's language file. The site's /ocr/ files need redeploying.";
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes.length < MIN_LANGUAGE_BYTES)
    return (
      `The scanner's language file arrived damaged (${bytes.length.toLocaleString("en-GB")} bytes). Try again; if ` +
      "it keeps happening, a proxy, antivirus or browser extension may be changing downloads."
    );
  return null;
}

/** Downloads the language file again, outside the engine, to explain why the engine could not use it. */
async function checkLanguageFile() {
  try {
    const response = await fetch(`${ocrBase()}${LANGUAGE_FILE}`, { cache: "no-store" });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    console.error("[SplitWisee receipt scanner] language file check:", {
      status: response.status,
      contentType,
      bytes: bytes.length,
    });
    return languageFileProblem({ status: response.status, contentType, bytes });
  } catch (error) {
    return `The scanner's language file could not be downloaded (${error.message}). Check your connection and try again.`;
  }
}

/** Plain-language reason for an engine failure (the technical detail is logged to the console). */
async function engineFailure(reason) {
  const detail = String(reason?.message ?? reason ?? "unknown error");
  console.error("[SplitWisee receipt scanner]", reason);
  if (/fetch|network|response code|404|load failed/i.test(detail))
    return new ScanStopped(
      `The receipt scanner files could not be downloaded (${detail}). Check your connection and try again.`,
    );
  if (/initiali[sz]ation failed/i.test(detail))
    return new ScanStopped(
      (await checkLanguageFile()) ??
        "The scanner's language data could not be loaded. Close other tabs and try again, or use another browser.",
    );
  return new ScanStopped(`The receipt scanner could not start in this browser (${detail}).`);
}

/**
 * Starts a Tesseract worker. Tesseract never settles createWorker() when language data or initialisation fails; it
 * only calls errorHandler, so that is turned into a rejection here.
 * `safeMode` skips the browser's cached model and uses the plain (non-SIMD) WebAssembly build.
 */
async function startWorker({ safeMode, onEngineProgress }) {
  const { createWorker } = await import("tesseract.js");
  const base = ocrBase();
  return new Promise((resolve, reject) => {
    createWorker("eng", TESSERACT_OPTIONS.oem, {
      workerPath: `${base}worker.min.js`,
      corePath: safeMode ? `${base}tesseract-core-lstm.wasm.js` : base,
      langPath: base,
      gzip: false, // fetch LANGUAGE_FILE rather than "eng.traineddata.gz"; Tesseract still unpacks the gzip bytes
      cacheMethod: safeMode ? "refresh" : "write",
      workerBlobURL: false,
      logger: onEngineProgress,
      errorHandler: reject,
    }).then(resolve, reject);
  });
}

/** Joins PDF.js text items into lines by their vertical position. */
function pdfPageText(content) {
  const lines = [];
  let line = "";
  let lastY = null;
  for (const item of content.items) {
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 3) {
      lines.push(line.trim());
      line = "";
    }
    line += `${item.str} `;
    lastY = y;
  }
  lines.push(line.trim());
  return lines.join("\n");
}

/**
 * Reads a receipt and returns parseReceipt() suggestions.
 * @param {Blob} file prepared receipt image (see prepareReceipt) or a PDF
 * @param {{ onProgress?: (percent: number, stage: string) => void, signal?: AbortSignal }} options
 */
export async function scanReceipt(file, { onProgress = () => {}, signal } = {}) {
  if (typeof WebAssembly !== "object")
    throw new ScanStopped(
      "This browser has WebAssembly turned off, which the receipt scanner needs. Enter the details yourself.",
    );

  let worker;
  let cancelled = false;
  let pass = 0;
  let passCount = 1;
  let rejectStop;
  const stopped = new Promise((_, reject) => {
    rejectStop = reject;
  });
  stopped.catch(() => {});
  const stop = (error = new ScanStopped()) => {
    cancelled = true;
    rejectStop(error);
  };
  const timer = setTimeout(
    () => stop(new ScanStopped("Scanning took too long. Try a clearer or smaller photo.")),
    SCAN_TIMEOUT_MS,
  );
  signal?.addEventListener("abort", () => stop(), { once: true });
  if (signal?.aborted) stop();
  const untilStopped = (promise) => Promise.race([promise, stopped]);

  // Each loading stage reports its own 0–1 progress; the bar only moves forward across them.
  let loaded = 2;
  const onEngineProgress = ({ status, progress }) => {
    if (status === "recognizing text")
      onProgress(
        30 + Math.round(((pass + progress) / passCount) * 65),
        pass ? "Checking the receipt again" : "Reading text",
      );
    else {
      const stage = Math.max(0, LOADING_STAGES.indexOf(status));
      loaded = Math.max(loaded, Math.round(((stage + progress) / LOADING_STAGES.length) * 25));
      onProgress(loaded, "Loading the scanner");
    }
  };

  async function engine() {
    if (worker) return worker;
    onProgress(2, "Loading the scanner");
    for (const safeMode of [false, true]) {
      const starting = startWorker({ safeMode, onEngineProgress });
      // A worker that finishes loading after the scan was stopped must still be shut down.
      starting.then((started) => cancelled && started.terminate()).catch(() => {});
      try {
        worker = await untilStopped(starting);
        await untilStopped(worker.setParameters(TESSERACT_OPTIONS.parameters));
        return worker;
      } catch (failure) {
        if (cancelled) throw failure;
        if (safeMode) throw await untilStopped(engineFailure(failure));
        console.warn("[SplitWisee receipt scanner] retrying in safe mode:", failure);
      }
    }
    return worker;
  }

  /** Reads one image (a prepared photo or a rendered PDF page) in the passes listed by ocrPasses(). */
  async function ocr(image) {
    const tesseract = await engine();
    const cleaned = await untilStopped(cleanedCopy(image));
    const larger = enlargedSize(cleaned.width, cleaned.height);
    const enlarged = larger && (await untilStopped(cleanedCopy(image, larger)));
    const passes = ocrPasses(cleaned, image, enlarged);
    passCount = passes.length;
    try {
      return await bestReading(passes, async ({ image: input, pageMode }, index) => {
        pass = index;
        await untilStopped(tesseract.setParameters({ tessedit_pageseg_mode: pageMode }));
        const { data } = await untilStopped(tesseract.recognize(input, { rotateAuto: true }));
        return data.text;
      });
    } finally {
      // Releases the pixel memory straight away.
      for (const canvas of [cleaned, enlarged]) if (canvas) canvas.width = canvas.height = 1;
    }
  }

  async function pdf() {
    onProgress(5, "Opening PDF");
    const [pdfjs, { default: workerUrl }] = await untilStopped(
      Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]),
    );
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    // In PDF.js 6 the loading task (not the document) owns the worker, so it is what must be destroyed.
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      wasmUrl: `${ocrBase()}pdfjs/wasm/`,
    });
    try {
      const pdfDocument = await untilStopped(loadingTask.promise);
      if (pdfDocument.numPages > MAX_PDF_PAGES)
        throw new Error(`Choose a receipt PDF with at most ${MAX_PDF_PAGES} pages.`);
      const texts = [];
      const scannedPages = [];
      for (let number = 1; number <= pdfDocument.numPages; number++) {
        const page = await untilStopped(pdfDocument.getPage(number));
        const text = pdfPageText(await untilStopped(page.getTextContent()));
        if (text.replace(/\s/g, "").length >= 30) texts.push(text);
        else scannedPages.push(page);
      }
      if (!scannedPages.length) return { text: texts.join("\n") };

      // Scanned PDF (a photo inside a PDF): render each page and OCR it like a photo.
      const readings = [];
      for (const page of scannedPages) {
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = Object.assign(document.createElement("canvas"), {
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
        });
        // "print" renders in one pass without requestAnimationFrame, which never fires in a background tab.
        await untilStopped(
          page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, intent: "print" }).promise,
        );
        readings.push(await ocr(canvas));
        canvas.width = canvas.height = 1;
      }
      return { text: texts.join("\n"), readings };
    } finally {
      await loadingTask.destroy();
    }
  }

  try {
    let reading;
    if (file.type === "application/pdf") {
      const { text, readings = [] } = await pdf();
      const textReading = text.trim() ? parseReceipt(text) : null;
      // Prefer the text layer; fall back to the best OCR'd page.
      reading = [textReading, ...readings]
        .filter(Boolean)
        .sort((a, b) => Number(b.amountPence !== null) - Number(a.amountPence !== null))[0];
    } else {
      reading = await ocr(file);
    }
    onProgress(100, "Done");
    return reading;
  } finally {
    clearTimeout(timer);
    await Promise.resolve(worker?.terminate()).catch(() => {});
  }
}
