const BASE32 = /^[A-Z2-7]{16,}$/;

/** The raw OPERATOR_TOTP_SECRETS setting ("" when unset). The singular spelling is accepted as a fallback. */
export function operatorSecretSetting(env = process.env) {
  return String(env.OPERATOR_TOTP_SECRETS ?? "").trim() || String(env.OPERATOR_TOTP_SECRET ?? "").trim();
}

/**
 * The platform owner's authenticator key from OPERATOR_TOTP_SECRETS. The documented form is a JSON map
 * {"<owner user id>":"<base32 key>"}. Because there is exactly one owner, a bare key is accepted too, and so are
 * the usual copy-paste accidents: curly quotes, a JSON value wrapped in extra quotes, spaces, lower case, a
 * whole `OPERATOR_TOTP_SECRETS=...` line pasted as the value, an otpauth:// link, and a map whose single entry has
 * a mistyped id. Who the owner is still comes only from SUPERADMIN_USER_ID.
 * Returns "" when no usable key is configured.
 */
export function operatorSecret(ownerId, raw = operatorSecretSetting()) {
  const text = String(raw ?? "")
    .trim()
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^(?:export\s+)?OPERATOR_TOTP_SECRETS?\s*=\s*/i, "")
    .trim();
  const clean = (value) =>
    String(value)
      .replace(/[\s=]+/g, "")
      .toUpperCase();
  const link = /^otpauth:\/\/.*[?&]secret=([^&#\s]+)/i.exec(text);
  if (link) return BASE32.test(clean(decodeURIComponent(link[1]))) ? clean(decodeURIComponent(link[1])) : "";
  const bare = clean(text.replace(/^["']+|["']+$/g, ""));
  if (BASE32.test(bare)) return bare;
  let value;
  try {
    value = JSON.parse(text);
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return "";
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const keys = Object.values(value).filter((key) => typeof key === "string" && key.trim());
  const key = typeof value[ownerId] === "string" ? value[ownerId] : keys.length === 1 ? keys[0] : "";
  return BASE32.test(clean(key)) ? clean(key) : "";
}

/** What the owner should fix when no usable key is configured (never includes the value itself). */
export function operatorSecretProblem(raw = operatorSecretSetting()) {
  return String(raw ?? "").trim()
    ? "OPERATOR_TOTP_SECRETS is set on this deployment but is not a valid authenticator key. Set its value to the key only (32 letters A-Z and digits 2-7, nothing else) and redeploy."
    : "OPERATOR_TOTP_SECRETS is not set on this deployment. Add it to the project's environment variables for Production, then redeploy.";
}
