import helmet from "helmet";
import crypto from "node:crypto";
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
const fail = (message, status) => Object.assign(new Error(message), { status });

// Unchanged v1.2.6 policy: OCR needs WebAssembly ('wasm-unsafe-eval') and blob: workers; no inline scripts.
export function securityHeaders(production) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        workerSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
  });
}

export function noStore(_req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

// API responses and the operator app must never be indexed, even if a crawler ignores robots.txt.
export function noIndex(_req, res, next) {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
}

// Every state-changing API request must come from an allowed origin (CSRF defence in depth).
export function requireAllowedOrigin(origins) {
  const allowed = new Set(origins);
  return (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !allowed.has(req.headers.origin))
      return next(fail("Origin not allowed.", 403));
    next();
  };
}

// Opaque cookie session; CSRF token required on every authenticated non-GET request.
export function createSession({ sessions, users, cookieName }) {
  return async function session(req, _res, next) {
    try {
      const raw = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      if (!raw) throw fail("Sign in to continue.", 401);
      const sess = await sessions.findOne({ id: hash(raw), expiresAt: { $gt: new Date() } });
      if (!sess) throw fail("Session expired. Sign in again.", 401);
      const u = await users.findOne({ id: sess.userId });
      if (u?.suspended) throw fail("Account suspended.", 403);
      if (!u?.verifiedAt) throw fail("Verify your email to continue.", 403);
      if (req.method !== "GET" && req.headers["x-csrf-token"] !== sess.csrf)
        throw fail("Refresh your session and try again.", 403);
      req.user = u;
      req.session = sess;
      next();
    } catch (e) {
      next(e);
    }
  };
}
