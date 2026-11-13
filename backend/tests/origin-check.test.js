import test from "node:test";
import assert from "node:assert/strict";
import { requireAllowedOrigin } from "../src/middleware/security.js";

// Runs the middleware on a fake request and returns the error status it produced (or null when it let it through).
function check(middleware, { method = "POST", origin, host, forwardedHost }) {
  const headers = { origin, host, "x-forwarded-host": forwardedHost };
  let result;
  middleware({ method, headers }, {}, (error) => {
    result = error ? error.status : null;
  });
  return result;
}

test("the configured origins are allowed and others refused", () => {
  const guard = requireAllowedOrigin(["https://app.example.com"]);
  assert.equal(check(guard, { origin: "https://app.example.com", host: "api.example.com" }), null);
  assert.equal(check(guard, { origin: "https://evil.example", host: "api.example.com" }), 403);
  assert.equal(check(guard, { origin: undefined, host: "api.example.com" }), 403);
  assert.equal(
    check(guard, { method: "GET", origin: "https://evil.example" }),
    null,
    "reads are not checked",
  );
  // Without sameHost, a same-address request that is not in the list is still refused (VPS behaviour unchanged).
  assert.equal(check(guard, { origin: "https://other.example.com", host: "other.example.com" }), 403);
});

test("sameHost accepts a request from the address it was sent to, and nothing else", () => {
  const guard = requireAllowedOrigin(["https://project.vercel.app"], { sameHost: true });
  const site = "https://splitwisee-two.vercel.app";
  // The production domain differs from the configured list (custom domain, alias, renamed project).
  assert.equal(check(guard, { origin: site, forwardedHost: "splitwisee-two.vercel.app" }), null);
  assert.equal(check(guard, { origin: site, host: "splitwisee-two.vercel.app" }), null);
  assert.equal(
    check(guard, { origin: site, forwardedHost: "Splitwisee-Two.vercel.app, proxy.internal" }),
    null,
  );
  assert.equal(check(guard, { origin: "https://project.vercel.app", host: "elsewhere.example" }), null);
  // Another website posting to this address is refused.
  assert.equal(
    check(guard, { origin: "https://evil.example", forwardedHost: "splitwisee-two.vercel.app" }),
    403,
  );
  // Plain HTTP and a missing Origin are refused.
  assert.equal(
    check(guard, { origin: "http://splitwisee-two.vercel.app", host: "splitwisee-two.vercel.app" }),
    403,
  );
  assert.equal(check(guard, { origin: undefined, host: "splitwisee-two.vercel.app" }), 403);
  assert.equal(check(guard, { origin: "", host: "" }), 403);
});

test("the real app accepts a same-address request only when sameHostOrigin is on", async (t) => {
  const { once } = await import("node:events");
  const { createApp } = await import("../src/app.js");
  const { initialiseDatabase } = await import("../database/init.js");
  const { createMemoryDb } = await import("./helpers/memory-db.js");
  const os = await import("node:os");
  const db = createMemoryDb();
  await initialiseDatabase(db, { log: { warn() {} } });
  const post = async (sameHostOrigin, headers) => {
    const app = await createApp(db, {
      origin: "https://configured.test",
      receiptDir: os.tmpdir(),
      production: false,
      sameHostOrigin,
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => server.close());
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/origin-probe`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: "{}",
    });
    return res.status;
  };
  const site = {
    origin: "https://splitwisee-two.vercel.app",
    "x-forwarded-host": "splitwisee-two.vercel.app",
  };
  assert.equal(await post(true, site), 404, "allowed through to routing (no such endpoint)");
  assert.equal(await post(false, site), 403);
  assert.equal(await post(true, { ...site, origin: "https://evil.example" }), 403);
  assert.equal(await post(true, { origin: "https://configured.test" }), 404);
});
