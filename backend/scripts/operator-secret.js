import crypto from "node:crypto";

/*
 * Creates the authenticator secret for the platform owner (superadmin).
 *   npm run operator:secret -- <your user ID>
 * Your user ID is shown in the app under Account & settings. Set the two printed variables on the API host
 * (backend/.env, or the Vercel project's environment variables), redeploy, scan the otpauth link (or type the key)
 * into an authenticator app, then open /admin/ and enter the 6-digit code.
 */
const userId = process.argv[2];
if (!userId) {
  console.error("Usage: npm run operator:secret -- <your user ID>  (shown under Account & settings)");
  process.exit(1);
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const bytes = crypto.randomBytes(20);
let bits = "";
for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
const secret = bits
  .match(/.{5}/g)
  .map((chunk) => alphabet[parseInt(chunk, 2)])
  .join("");
const label = encodeURIComponent("KoinSplit:owner");
console.log(`SUPERADMIN_USER_ID=${userId}`);
console.log(`OPERATOR_TOTP_SECRETS=${JSON.stringify({ [userId]: secret })}`);
console.log("");
console.log(`Authenticator key: ${secret}`);
console.log(`otpauth://totp/${label}?secret=${secret}&issuer=KoinSplit&algorithm=SHA1&digits=6&period=30`);
console.log("Keep the key private: anyone with it and your account can unlock the control centre.");
