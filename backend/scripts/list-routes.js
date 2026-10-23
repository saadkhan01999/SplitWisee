// Prints every HTTP route registered by createApp (method + path), straight from the Express router.
// Used by tests/route-inventory.test.js to keep README, API_REFERENCE.md and openapi.yaml complete.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
export async function listRoutes() {
  const noop = { collection: () => ({}), command: async () => ({ ok: 1 }) };
  const app = await createApp(noop, {
    origin: "https://example.test",
    receiptDir: path.join(os.tmpdir(), "splitwisee-route-list"),
  });
  const out = [];
  for (const layer of app.router.stack) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const p of paths)
      for (const m of Object.keys(layer.route.methods)) out.push(`${m.toUpperCase()} ${p}`);
  }
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log((await listRoutes()).join("\n"));
