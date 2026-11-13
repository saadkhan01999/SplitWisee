import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { listRoutes } from "../scripts/list-routes.js";
// Fails when a route is registered but missing from any of the three API documents (or documented but not registered).
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

function openapiRoutes(yaml) {
  const out = [];
  let current = null,
    inPaths = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const p = line.match(/^ {2}(\/\S*):\s*$/);
    if (p) {
      current = p[1].replace(/\{(\w+)\}/g, ":$1");
      continue;
    }
    const m = line.match(/^ {4}(get|post|put|patch|delete):/);
    if (m && current) out.push(`${m[1].toUpperCase()} ${current}`);
  }
  return out;
}

// backend/docs/ is excluded by the root .gitignore (docs/), so those checks run only where the folder exists.
const DOCS = fs.existsSync(new URL("../docs/api/openapi.yaml", import.meta.url));
const NO_DOCS = "backend/docs/ is not in this checkout (excluded by .gitignore)";

test("every registered route is listed in the README API table", async () => {
  const routes = await listRoutes();
  assert.equal(new Set(routes).size, routes.length, "no duplicate registrations");
  const readme = read("../../README.md");
  for (const r of routes) assert.ok(readme.includes("`" + r + "`"), "README.md documents " + r);
});

test(
  "every registered route is documented in openapi.yaml and API_REFERENCE.md (and nothing extra)",
  { skip: !DOCS && NO_DOCS },
  async () => {
    const routes = await listRoutes();
    const spec = openapiRoutes(read("../docs/api/openapi.yaml"));
    assert.deepEqual(
      [...spec].sort(),
      [...routes].sort(),
      "openapi.yaml operations match the router exactly",
    );
    const reference = read("../docs/API_REFERENCE.md");
    for (const r of routes)
      assert.ok(
        reference.includes("`" + r + "`") || reference.includes("`" + r + "?"),
        "API_REFERENCE.md documents " + r,
      );
  },
);

test("every household action type is documented", { skip: !DOCS && NO_DOCS }, async () => {
  const { ACTION_TYPES } = await import("../src/routes/households.js");
  const reference = read("../docs/API_REFERENCE.md"),
    yaml = read("../docs/api/openapi.yaml");
  for (const type of ACTION_TYPES) {
    assert.ok(reference.includes("| `" + type + "` |"), "API_REFERENCE.md action table lists " + type);
    assert.ok(yaml.includes(type), "openapi.yaml lists " + type);
  }
});
