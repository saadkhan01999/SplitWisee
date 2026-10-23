import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageDir = (name, from = require) => path.dirname(from.resolve(`${name}/package.json`));

/**
 * Runtime files for the in-browser receipt scanner. Tesseract loads its worker, WebAssembly core and language data
 * by URL, so they are published under /ocr/ with stable names instead of going through the bundler.
 */
function ocrFiles() {
  const tesseract = packageDir("tesseract.js");
  const core = packageDir("tesseract.js-core", createRequire(path.join(tesseract, "package.json")));
  const english = packageDir("@tesseract.js-data/eng");
  const pdfjs = packageDir("pdfjs-dist");
  const files = {
    "worker.min.js": path.join(tesseract, "dist/worker.min.js"),
    "tesseract-core-lstm.wasm.js": path.join(core, "tesseract-core-lstm.wasm.js"),
    "tesseract-core-simd-lstm.wasm.js": path.join(core, "tesseract-core-simd-lstm.wasm.js"),
    // Published without ".gz": download managers such as Internet Download Manager take over requests for ".gz"
    // files and answer the page with an empty HTTP 204, which leaves Tesseract with no model ("initialization
    // failed"). The bytes are still gzip; Tesseract recognises them and unpacks them itself.
    "eng.traineddata": path.join(english, "4.0.0_best_int/eng.traineddata.gz"),
  };
  // PDF.js image decoders (JPEG 2000 / JBIG2) for scanned PDF receipts.
  for (const name of [
    "openjpeg.wasm",
    "jbig2.wasm",
    "openjpeg_nowasm_fallback.js",
    "jbig2_nowasm_fallback.js",
  ])
    files[`pdfjs/wasm/${name}`] = path.join(pdfjs, "wasm", name);
  return files;
}

const contentType = (name) =>
  name.endsWith(".js")
    ? "text/javascript"
    : name.endsWith(".wasm")
      ? "application/wasm"
      : "application/octet-stream";

export function ocrAssets() {
  const files = ocrFiles();
  return {
    name: "splitwisee:ocr-assets",
    configureServer(server) {
      server.middlewares.use("/ocr/", (req, res, next) => {
        const source = files[decodeURIComponent(req.url.split("?")[0].replace(/^\//, ""))];
        if (!source) return next();
        res.setHeader("Content-Type", contentType(source));
        fs.createReadStream(source).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, source] of Object.entries(files))
        this.emitFile({ type: "asset", fileName: `ocr/${name}`, source: fs.readFileSync(source) });
    },
  };
}
