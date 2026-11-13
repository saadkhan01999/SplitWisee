import { initialiseDatabase } from "../database/init.js";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { checkEnvironment, version } from "./config/env.js";
import { retryReferralCredits } from "./routes/platform.js";
import { purgeExpiredReceipts } from "./services/retention.js";

/*
 * Process entry point: validate configuration, connect to MongoDB, apply the additive initializer, listen and shut
 * down gracefully. `npm run dev` loads backend/.env; `npm start` uses the variables provided by the host.
 */
const { errors, warnings } = checkEnvironment();
for (const warning of warnings) console.warn(`Configuration warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`Configuration error: ${error}`);
  process.exit(1);
}

const { client, db } = await connectDatabase();
await initialiseDatabase(db, { tolerateValidatorPermission: true, log: console });
const app = await createApp(db);

// Pending referral invoice credits are retried in the background; one run at a time.
let retrying = false;
const referralTimer = setInterval(async () => {
  if (retrying) return;
  retrying = true;
  try {
    await retryReferralCredits(db);
  } catch {
    console.error("Referral credit retry failed");
  } finally {
    retrying = false;
  }
}, 60_000);
referralTimer.unref();

// Receipt retention: once a day, remove original files past their retention date. Does nothing until the platform
// owner approves the policy in the control centre; households on legal hold are skipped.
const retentionTimer = setInterval(async () => {
  try {
    const result = await purgeExpiredReceipts(db, app.locals.receiptDir);
    if (result.removed) console.info(`Receipt retention removed ${result.removed} original files`);
  } catch {
    console.error("Receipt retention run failed");
  }
}, 864e5);
retentionTimer.unref();

const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || "0.0.0.0";
const server = app.listen(port, host, () => {
  console.info(
    `CoinSplit API ready (v${version}) on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
  );
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(referralTimer);
  clearInterval(retentionTimer);
  setTimeout(() => process.exit(1), 10_000).unref(); // never hang a deployment
  server.close(async () => {
    await client.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
