import fs from "node:fs";

/** Publishes src/service-worker.js as /sw.js, stamped with the release version so each release refreshes its caches. */
export function serviceWorker({ source, version }) {
  return {
    name: "splitwisee:service-worker",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: fs.readFileSync(source, "utf8").replaceAll("__APP_VERSION__", version),
      });
    },
  };
}
