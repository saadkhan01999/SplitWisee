// Wraps async route handlers so rejected promises reach the error handler.
export const endpoint = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function apiNotFound(_req, res) {
  res.status(404).json({ error: "Endpoint not found." });
}

// Client-facing messages come only from errors the code raised deliberately: an explicit `status`, or a plain `Error`
// thrown by domain validation (calculation engine, households, settings, accounting, profile). Anything else
// (TypeError, MongoDB, file-system, provider SDK) is an internal failure: 500 with a generic message.
export function classifyError(err) {
  if (err?.type === "entity.parse.failed")
    return { status: 400, message: "Request body must be valid JSON." };
  if (err?.type === "entity.too.large") return { status: 413, message: "Request is too large." };
  if (/^Stripe/.test(err?.type || err?.name || ""))
    return {
      status: 502,
      message: "The payment provider could not complete this request" + (err.code ? ` (${err.code}).` : "."),
    };
  let status = Number(err?.status || err?.statusCode) || 0;
  if (!status) status = err?.constructor === Error && !err.code ? 400 : 500;
  return {
    status,
    message: status >= 500 ? "Service temporarily unavailable. Please try again." : err.message,
  };
}

export function errorHandler(err, req, res, _next) {
  const { status, message } = classifyError(err);
  if (err?.retryAfter) res.set("Retry-After", String(err.retryAfter));
  res.status(status).json({ error: message });
  // Never log messages, bodies or headers: they can contain personal data. Route pattern only, not concrete IDs.
  if (status >= 500)
    console.error(
      JSON.stringify({
        errorType: err?.name,
        code: err?.code,
        status,
        method: req.method,
        route: req.route?.path || "unmatched",
      }),
    );
}
