import os from "node:os";
import path from "node:path";
import { initialiseDatabase } from "../database/init.js";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { checkEnvironment, parseOrigins } from "./config/env.js";

/*
 * Vercel Function entry point (vercel.json → services.backend). Vercel sends every /api/* request here with its path
 * unchanged, so the Express routes are the same as on a VPS, where src/server.js stays the entry point.
 *
 * A function has no long-lived process and a read-only disk, so unlike server.js:
 * - MongoDB and the app are set up on the first request and reused while the instance stays warm;
 * - receipts are kept in the instance's temporary folder (the only writable one), which is lost when it is recycled;
 * - APP_ORIGIN defaults to this deployment's address, and its other Vercel addresses are allowed too;
 * - without SMTP, one-time codes are shown on screen (DEMO_SHOW_CODES, set it to false to turn this off);
 * - the background referral-credit retry does not run.
 */
const env = process.env;
const addresses = [
  env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_BRANCH_URL,
  env.VERCEL_URL,
  env.VERCEL_PROJECT_PRODUCTION_URL,
]
  .filter(Boolean)
  .map((host) => `${env.VERCEL_ENV === "development" ? "http" : "https"}://${host}`); // development: `vercel dev`
const deployed = env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
const receiptDir = path.join(os.tmpdir(), "splitwisee-receipts");

// Local-development values copied from .env.example cannot work here, so they are replaced (and reported below):
// a deployed function is always served over HTTPS behind one Vercel proxy, and only the temporary folder is writable.
const ignored = [];
if (deployed && env.APP_ORIGIN && !env.APP_ORIGIN.startsWith("https://")) ignored.push("APP_ORIGIN");
if (env.TRUST_PROXY_HOPS && !Number(env.TRUST_PROXY_HOPS)) ignored.push("TRUST_PROXY_HOPS");
if (env.RECEIPT_DIR && path.resolve(env.RECEIPT_DIR) !== receiptDir) ignored.push("RECEIPT_DIR");
if ((!env.APP_ORIGIN || ignored.includes("APP_ORIGIN")) && addresses.length) env.APP_ORIGIN = addresses[0];
if (!Number(env.TRUST_PROXY_HOPS)) env.TRUST_PROXY_HOPS = "1"; // Vercel sets X-Forwarded-For to the client address
env.DEMO_SHOW_CODES ||= "true";

async function start() {
  // The production rules in checkEnvironment (SMTP, Stripe billing, RECEIPT_DIR) describe the VPS deployment. A Vercel
  // demo runs without them, so only the base checks (MongoDB URI, origin format) stop it here.
  const { errors, warnings } = checkEnvironment({ ...env, NODE_ENV: "development" });
  if (ignored.length)
    warnings.push(
      `${ignored.join(", ")} ignored on Vercel. Remove them from the project's environment variables.`,
    );
  for (const warning of warnings) console.warn(`Configuration warning: ${warning}`);
  if (errors.length) throw new Error(errors.map((error) => `Configuration error: ${error}`).join("\n"));

  const { client, db } = await connectDatabase();
  try {
    await initialiseDatabase(db, { tolerateValidatorPermission: true, log: console });
    return await createApp(db, {
      corsOrigins: [...new Set([...parseOrigins(env.CORS_ORIGINS), ...addresses])].filter(
        (origin) => origin !== env.APP_ORIGIN,
      ),
      receiptDir,
    });
  } catch (error) {
    await client.close();
    throw error;
  }
}

let ready;
export default async function handler(req, res) {
  // A failed start is not cached: the next request tries again (for example after a database outage).
  ready ??= start().catch((error) => {
    ready = undefined;
    throw error;
  });
  let app;
  try {
    app = await ready;
  } catch (error) {
    console.error("SplitWisee API failed to start:", error); // like server.js, which exits with the same error
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "Service temporarily unavailable. Please try again." }));
    return;
  }
  app(req, res);
}
