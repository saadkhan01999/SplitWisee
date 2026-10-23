import { vi } from "vitest";

/**
 * Replaces fetch with an in-memory API. `routes` maps "METHOD /path" (path after /api/v1, without the query) to
 * a handler `({ body, url }) => responseBody` or `{ status, body }` via `reply()`. Every call is recorded.
 */
export function mockApi(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = init.method ?? "GET";
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, headers: init.headers ?? {} });
    const handler = routes[`${method} ${path}`];
    if (!handler) return jsonResponse(404, { error: `No mock for ${method} ${path}` });
    const result = await handler({ body, url });
    return result instanceof Reply ? jsonResponse(result.status, result.body) : jsonResponse(200, result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    called: (method, path) => calls.filter((call) => call.method === method && call.path === path),
  };
}

class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

export const reply = (status, body) => new Reply(status, body);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
