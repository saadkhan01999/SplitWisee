import test from "node:test";
import assert from "node:assert/strict";
import { operatorSecret, operatorSecretProblem, operatorSecretSetting } from "../src/config/operator.js";
import { classifyError } from "../src/middleware/errors.js";
import { boot, account } from "./helpers/http.js";
import { totp } from "../src/routes/platform.js";

// Made-up test values (not a real account or authenticator key).
const KEY = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const ID = "00000000-0000-4000-8000-000000000001";

test("operatorSecret reads the documented JSON map and common copy-paste variants", () => {
  const json = JSON.stringify({ [ID]: KEY });
  const accepted = [
    json,
    ` ${json}\n`,
    KEY,
    KEY.toLowerCase(),
    `"${KEY}"`,
    KEY.replace(/(.{4})/g, "$1 ").trim(),
    `{\u201C${ID}\u201D:\u201C${KEY}\u201D}`, // curly quotes from a document or chat app
    JSON.stringify(json), // the JSON wrapped in extra quotes
    JSON.stringify({ "00000000-0000-4000-8000-000000000002": KEY }), // single entry with a mistyped id
    JSON.stringify({ [ID]: `${KEY}====` }),
    `OPERATOR_TOTP_SECRETS=${json}`, // the whole .env line pasted as the value
    `OPERATOR_TOTP_SECRETS=${KEY}`,
    `otpauth://totp/CoinSplit%3Aowner?secret=${KEY}&issuer=CoinSplit&algorithm=SHA1&digits=6&period=30`,
  ];
  for (const raw of accepted) assert.equal(operatorSecret(ID, raw), KEY, raw);
  // With several entries the owner's own entry is required.
  assert.equal(operatorSecret(ID, JSON.stringify({ a: "JBSWY3DPEHPK3PXP", [ID]: KEY })), KEY);
  assert.equal(operatorSecret(ID, JSON.stringify({ a: "JBSWY3DPEHPK3PXP", b: KEY })), "");

  for (const raw of [
    undefined,
    "",
    "{}",
    "not a key!",
    "{bad json",
    JSON.stringify({ [ID]: "short" }),
    "[1,2]",
  ])
    assert.equal(operatorSecret(ID, raw), "", String(raw));
});

test("the setting name and the problem message", () => {
  assert.equal(operatorSecretSetting({ OPERATOR_TOTP_SECRETS: ` ${KEY} ` }), KEY);
  assert.equal(operatorSecretSetting({ OPERATOR_TOTP_SECRET: KEY }), KEY);
  assert.equal(operatorSecretSetting({}), "");
  assert.match(operatorSecretProblem(""), /is not set on this deployment/);
  assert.match(operatorSecretProblem("garbage"), /not a valid authenticator key/);
  assert.doesNotMatch(operatorSecretProblem("garbage"), /garbage/);
});

test("a 5xx error keeps its message only when it is marked expose", () => {
  const generic = "Service temporarily unavailable. Please try again.";
  assert.equal(classifyError(Object.assign(new Error("internal detail"), { status: 503 })).message, generic);
  assert.deepEqual(classifyError(Object.assign(new Error("Set the key."), { status: 503, expose: true })), {
    status: 503,
    message: "Set the key.",
  });
  assert.equal(classifyError(new TypeError("x")).message, generic);
});

async function ownerWith(t, secrets) {
  const env = await boot(t, { env: { SUPERADMIN_USER_ID: undefined, OPERATOR_TOTP_SECRETS: undefined } });
  const owner = env.client();
  const O = await account(env, owner, "owner-secret@example.test", "Platform Owner");
  process.env.SUPERADMIN_USER_ID = O.id;
  if (secrets === undefined) delete process.env.OPERATOR_TOTP_SECRETS;
  else process.env.OPERATOR_TOTP_SECRETS = typeof secrets === "function" ? secrets(O.id) : secrets;
  t.after(() => {
    delete process.env.SUPERADMIN_USER_ID;
    delete process.env.OPERATOR_TOTP_SECRETS;
  });
  return { owner, O };
}

test("unlock works with a bare key in OPERATOR_TOTP_SECRETS", async (t) => {
  const { owner } = await ownerWith(t, KEY);
  const res = await owner.post("/api/v1/operator/unlock", { code: totp(KEY) });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await owner.get("/api/v1/operator/overview")).status, 200);
});

test("unlock works when the JSON was pasted with curly quotes", async (t) => {
  const { owner } = await ownerWith(t, (id) => `{\u201C${id}\u201D:\u201C${KEY}\u201D}`);
  assert.equal((await owner.post("/api/v1/operator/unlock", { code: totp(KEY) })).status, 200);
});

test("a missing key tells the owner what to set instead of a generic error", async (t) => {
  const { owner } = await ownerWith(t, undefined);
  const res = await owner.post("/api/v1/operator/unlock", { code: "123456" });
  assert.equal(res.status, 503);
  assert.match(res.data.error, /OPERATOR_TOTP_SECRETS is not set on this deployment/);
  assert.doesNotMatch(res.data.error, /temporarily unavailable/);
});

test("an unreadable key says it is set but invalid, without echoing it", async (t) => {
  const { owner } = await ownerWith(t, "my-secret-value-01");
  const res = await owner.post("/api/v1/operator/unlock", { code: "123456" });
  assert.equal(res.status, 503);
  assert.match(res.data.error, /not a valid authenticator key/);
  assert.doesNotMatch(res.data.error, /my-secret-value/);
});
