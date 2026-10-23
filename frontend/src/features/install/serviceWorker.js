/** Registers the offline-shell service worker in production builds served over HTTPS (or localhost). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {
        // The app works without offline support.
      });
  });
}

export async function serviceWorkerStatus() {
  if (!("serviceWorker" in navigator)) return "not supported";
  const registration = await navigator.serviceWorker.getRegistration("/").catch(() => null);
  if (!registration) return import.meta.env.PROD ? "not registered" : "disabled in development";
  if (registration.active) return "ready";
  return registration.installing || registration.waiting ? "activating" : "registered";
}
