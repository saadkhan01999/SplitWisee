const BASE32 = /^[A-Z2-7]{16,}$/;

/**
 * The platform owner's authenticator key from OPERATOR_TOTP_SECRETS. The documented form is a JSON map
 * {"<owner user id>":"<base32 key>"}. Because there is exactly one owner, a bare key is accepted too, and so are
 * the usual copy-paste accidents: curly quotes, a JSON value wrapped in extra quotes, spaces, lower case, and a
 * map whose single entry has a mistyped id. Who the owner is still comes only from SUPERADMIN_USER_ID.
 * Returns "" when no usable key is configured.
 */
export function operatorSecret(ownerId, raw = process.env.OPERATOR_TOTP_SECRETS) {
  const text = String(raw ?? "")
    .trim()
    .replace(/[“”„″]/g, '"')
    .replace(/[‘’]/g, "'");
  const clean = (value) =>
    String(value)
      .replace(/[\s=]+/g, "")
      .toUpperCase();
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
