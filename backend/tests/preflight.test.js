import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { preflight } from "../scripts/preflight.js";
import { checkEnvironment, frontendRoot, resolveReceiptDir } from "../src/config/env.js";

const configured = {
  NODE_ENV: "production",
  APP_ORIGIN: "https://app.example.com",
  MONGODB_URI: "mongodb+srv://app:secret@cluster0.example.mongodb.net/splitwisee",
  MONGODB_DB: "splitwisee",
  SMTP_HOST: "smtp.example.com",
  EMAIL_FROM: "SplitWisee <no-reply@example.com>",
  BILLING_ENFORCED: "true",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_ID: "price_x",
  BANK_ENCRYPTION_KEY: "ab".repeat(32),
  SUPERADMIN_USER_ID: "owner-1",
  OPERATOR_TOTP_SECRETS: JSON.stringify({ "owner-1": "JBSWY3DPEHPK3PXPJBSWY3DP" }),
  RECEIPT_DIR: path.resolve(frontendRoot, "..", "..", "receipts"),
  TRUST_PROXY_HOPS: "1",
};
const status = (report, id) => report.checks.find((check) => check.id === id)?.status;

test("preflight: a fully configured (fictional) production environment has no blockers but is never 'launch verified'", () => {
  const report = preflight({ env: configured });
  assert.deepEqual(
    report.checks.filter((check) => check.status === "blocked").map((check) => check.id),
    [],
  );
  assert.equal(report.configuration, "configured");
  assert.equal(report.launchVerified, false);
  const json = JSON.stringify(report);
  for (const value of [
    "sk_live_x",
    "whsec_x",
    "app:secret@",
    "ab".repeat(32),
    "JBSWY3DPEHPK3PXP",
    "owner-1",
    "smtp.example.com",
  ]) {
    assert.equal(json.includes(value), false, `value not echoed: ${value}`);
  }
});

test("preflight: placeholder Atlas URI, unsafe receipt paths, legacy operator lists and proxy setup are flagged", () => {
  let report = preflight({
    env: {
      ...configured,
      MONGODB_URI: "mongodb+srv://YOUR_DB_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/splitwisee",
    },
  });
  assert.equal(status(report, "mongodb"), "blocked");
  report = preflight({ env: { ...configured, RECEIPT_DIR: "./private-receipts" } });
  assert.equal(
    status(report, "receipt-storage"),
    "blocked",
    "relative paths depend on the working directory",
  );
  report = preflight({ env: { ...configured, RECEIPT_DIR: path.join(frontendRoot, "dist", "uploads") } });
  assert.equal(status(report, "receipt-storage"), "blocked", "never inside the public frontend");
  report = preflight({
    env: { ...configured, OPERATOR_USER_IDS: "a,b", TRUST_PROXY_HOPS: "0", CORS_ORIGINS: "http://x.test" },
  });
  assert.equal(status(report, "legacy-operator-list"), "review");
  assert.equal(status(report, "proxy-hops"), "review");
  assert.equal(status(report, "cors-origins"), "review");
  assert.equal(report.configuration, "configured", "review items do not block");
});

test("startup checks refuse unsafe production configuration and warn on risky settings", () => {
  assert.deepEqual(checkEnvironment(configured).errors, []);
  assert.match(checkEnvironment({ ...configured, RECEIPT_DIR: "" }).errors.join(" "), /RECEIPT_DIR/);
  assert.match(
    checkEnvironment({ ...configured, APP_ORIGIN: "http://app.example.com" }).errors.join(" "),
    /HTTPS APP_ORIGIN/,
  );
  assert.match(
    checkEnvironment({ ...configured, APP_ORIGIN: "https://app.example.com/" }).errors.join(" "),
    /origin only/,
  );
  assert.match(
    checkEnvironment({ ...configured, BILLING_ENFORCED: "false" }).errors.join(" "),
    /BILLING_ENFORCED/,
  );
  assert.match(
    checkEnvironment({ ...configured, CORS_ORIGINS: "http://x.test" }).errors.join(" "),
    /HTTPS in production/,
  );
  assert.match(
    checkEnvironment({
      MONGODB_URI: "mongodb+srv://YOUR_DB_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER_HOST/x",
    }).errors.join(" "),
    /placeholder/,
  );
  assert.match(checkEnvironment({}).errors.join(" "), /Set MONGODB_URI/);
  const warnings = checkEnvironment({
    ...configured,
    DEV_SHOW_EMAIL_CODES: "true",
    TRUST_PROXY_HOPS: "0",
    OPERATOR_USER_IDS: "x",
  }).warnings.join(" ");
  assert.match(warnings, /DEV_SHOW_EMAIL_CODES is ignored/);
  assert.match(warnings, /TRUST_PROXY_HOPS/);
  assert.match(warnings, /deprecated/);
  assert.deepEqual(
    checkEnvironment({ MONGODB_URI: "mongodb://localhost:27017/?replicaSet=rs0" }).errors,
    [],
    "development needs only a database",
  );
  assert.throws(() => resolveReceiptDir(path.join(frontendRoot, "x")), /frontend folder/);
  assert.equal(path.isAbsolute(resolveReceiptDir("relative-dir")), true);
});
