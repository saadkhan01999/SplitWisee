import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { defaultSettings } from "../backend/src/modules/site-settings/index.js";
import packageJson from "./package.json" with { type: "json" };
import { ocrAssets } from "./vite/ocrAssets.js";
import { serviceWorker } from "./vite/serviceWorker.js";
import { siteMeta } from "./vite/siteMeta.js";

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url));
const trimSlash = (value = "") => value.trim().replace(/\/+$/, "");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fromRoot("."), "");
  const apiBase = trimSlash(env.VITE_API_BASE_URL);
  const apiOrigin = apiBase ? new URL(apiBase).origin : "";

  return {
    plugins: [
      react(),
      ocrAssets(),
      serviceWorker({ source: fromRoot("src/service-worker.js"), version: packageJson.version }),
      siteMeta({
        siteUrl: trimSlash(env.VITE_SITE_URL),
        apiOrigin,
        title: defaultSettings.seoTitle,
        description: defaultSettings.seoDescription,
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      // Pure business rules (exact-pence splits, household roles, receipt metadata, platform accounting) are
      // owned by the API. The browser imports the same modules so previews always match what the server enforces.
      alias: { "@domain": fromRoot("../backend/src/modules") },
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      fs: { allow: [fromRoot("."), fromRoot("../backend/src/modules")] },
      proxy: {
        "/api": { target: env.VITE_DEV_API_PROXY || "http://127.0.0.1:5000", changeOrigin: false },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        "/api": { target: env.VITE_DEV_API_PROXY || "http://127.0.0.1:5000", changeOrigin: false },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        input: { main: fromRoot("index.html"), admin: fromRoot("admin/index.html") },
        output: {
          // Readable, cache-friendly chunks: libraries that rarely change, the shared business rules imported from
          // the API package, and app code used by both the member app and the operator console.
          advancedChunks: {
            groups: [
              {
                name: "vendor",
                test: /node_modules\/(react|react-dom|scheduler|react-redux|@reduxjs|redux|immer|reselect|use-sync-external-store)\//,
              },
              { name: "ocr", test: /node_modules\/(tesseract\.js|regenerator-runtime)\// },
              { name: "domain", test: /backend\/src\/modules\// },
              { name: "shared", test: /frontend\/src\//, minShareCount: 2 },
            ],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: false,
      setupFiles: ["./tests/setup.js"],
      include: ["tests/**/*.test.{js,jsx}"],
      restoreMocks: true,
    },
  };
});
