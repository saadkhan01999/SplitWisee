import { useSyncExternalStore } from "react";

// Browsers fire `beforeinstallprompt` once, often before any React component mounts, so the event is captured
// here at startup and exposed to components through useInstallPrompt().

const listeners = new Set();
let deferredPrompt = null;
let state = { canPrompt: false, installing: false, installed: false, message: "" };

function update(changes) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

export function installEnvironment(nav = navigator, win = window) {
  const ua = nav.userAgent || "";
  return {
    ios: /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1),
    embedded: /FBAN|FBAV|Instagram|; wv\)|WebView|GSA\//i.test(ua) || win.self !== win.top,
    standalone: Boolean(win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone),
    secure: win.isSecureContext === true,
  };
}

export function listenForInstallPrompt() {
  update({ installed: installEnvironment().standalone });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    update({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    update({
      canPrompt: false,
      installed: true,
      message: "SplitWisee is installed. Open it from your home screen.",
    });
  });
}

/** Shows the browser's own install dialog. Must be called directly from a click. */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event || state.installing) return;
  deferredPrompt = null;
  update({ canPrompt: false, installing: true });
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    update({
      message:
        outcome === "accepted"
          ? "Installation accepted. When your browser finishes, open SplitWisee from your home screen."
          : "Installation dismissed. You can install later from your browser menu.",
    });
  } catch {
    update({ message: "Your browser could not open its install prompt. Follow the steps below." });
  } finally {
    update({ installing: false });
  }
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useInstallPrompt() {
  return useSyncExternalStore(subscribe, () => state);
}
