// Thin client for the SplitWisee REST API. Sessions use an HttpOnly cookie; every write also sends the CSRF
// token the API returns from /me and sign-in responses.

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const TIMEOUT_MS = 20_000;

let csrfToken = "";
let onUnauthorized = () => {};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Absolute URL for an API path, for links and images that the browser loads directly (receipts, OAuth). */
export function apiUrl(path) {
  return `${API_BASE}/api/v1${path}`;
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function clearCsrfToken() {
  csrfToken = "";
}

async function request(path, { method, body, signal, timeout = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeout);
  signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(method !== "GET" && csrfToken && { "X-CSRF-Token": csrfToken }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw new ApiError("The service took too long to respond. Check your connection and try again.", 0);
    throw new ApiError("Cannot reach SplitWisee. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The SplitWisee service returned an unexpected response. Please try again.",
      response.status,
    );
  }

  if (!response.ok) {
    if (response.status === 401 && csrfToken) {
      clearCsrfToken();
      onUnauthorized();
    }
    throw new ApiError(data?.error || "Request failed.", response.status);
  }
  if (data?.csrf) csrfToken = data.csrf;
  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body = {}, options) => request(path, { ...options, method: "POST", body }),
};
