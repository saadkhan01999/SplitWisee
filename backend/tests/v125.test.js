import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { preflight } from "../scripts/preflight.js";
import { JSDOM, VirtualConsole } from "jsdom";

test("preflight detects deployment gaps without leaking secrets or certifying launch", () => {
  const r = preflight({
    env: {
      STRIPE_SECRET_KEY: "sk_test_DO_NOT_LEAK",
      MONGODB_URI: "mongodb://secret:password@example.test/db",
    },
  });
  assert.equal(r.configuration, "blocked");
  assert.equal(r.launchVerified, false);
  assert.doesNotMatch(JSON.stringify(r), /DO_NOT_LEAK|password@example/);
  assert.ok(r.checks.some((c) => c.id === "single-owner" && c.status === "blocked"));
  assert.ok(r.checks.some((c) => c.id === "node" && c.status === "pass"));
});
test("handover checklist saves review progress and exports an attached JSON download", () => {
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(fs.readFileSync(new URL("../docs/handover/index.html", import.meta.url), "utf8"), {
      url: "https://handover.test/",
      runScripts: "dangerously",
      virtualConsole: vc,
    }),
    w = dom.window;
  let name;
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    assert.equal(this.isConnected, true);
    name = this.download;
  };
  const check = w.document.querySelector("#checks input");
  check.click();
  assert.match(w.document.querySelector("#count").textContent, /1 of 10/);
  assert.equal(JSON.parse(w.localStorage.getItem("sw-handover-v126")).checked.source, true);
  w.document.querySelector("#download").click();
  assert.equal(name, "SplitWisee-v1.2.6-Handover-Checklist.json");
  assert.deepEqual(errors, []);
  dom.window.close();
});
