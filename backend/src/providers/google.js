import { OAuth2Client } from "google-auth-library";
// Google OAuth (authorization code + PKCE + nonce). Optional; unavailable unless both variables are set.
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleClient(origin) {
  if (!googleConfigured())
    throw Object.assign(new Error("Google sign-in is not configured."), { status: 503 });
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    origin + "/api/v1/auth/google/callback",
  );
}
