const KEYS = ["invite", "ref", "auth_error", "checkout", "action", "view"];

/**
 * Reads one-time parameters from the address the app was opened with (invitation and referral links, OAuth and
 * checkout returns, home-screen shortcuts) and removes them so a reload never replays them.
 */
export function takeLaunchParams(location = window.location, history = window.history) {
  const url = new URL(location.href);
  const get = (key) => url.searchParams.get(key)?.trim() || null;
  const params = {
    invite: get("invite"),
    referral: get("ref"),
    authError: url.searchParams.has("auth_error"),
    checkout: get("checkout"),
    action: get("action"),
    view: get("view"),
  };
  if (KEYS.some((key) => url.searchParams.has(key))) {
    KEYS.forEach((key) => url.searchParams.delete(key));
    history.replaceState(history.state, "", url);
  }
  return params;
}
