/**
 * Credentialed CORS for explicitly allowed origins only.
 *
 * Not needed when the frontend and `/api` share one domain (the recommended deployment: Nginx serves the built
 * frontend and proxies `/api` to this server). Use `CORS_ORIGINS` only when the API runs on a sibling subdomain
 * (e.g. frontend `https://app.example.com`, API `https://api.example.com`): those are the same *site*, so the
 * SameSite=Strict session cookie still flows. Never use a wildcard.
 */
export function corsForOrigins(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function cors(req, res, next) {
    const origin = req.headers.origin;
    if (!origin || !allowed.has(origin)) return next();
    res.vary("Origin");
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
    });
    if (req.method !== "OPTIONS") return next();
    res.set({
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
      "Access-Control-Max-Age": "600",
    });
    res.status(204).end();
  };
}
