import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
const EXIT_MS = 140;
// Animate only where the browser can tell us motion is welcome; otherwise (reduced motion, tests) close at once.
const animateExit = () =>
  typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Accessible dialog: focus moves in and is trapped, Escape closes, focus returns to the opener. */
export function Modal({ title, children, onClose: close, wide = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef(null);
  // A short exit transition, then the real close. Repeated requests while closing are ignored.
  const onClose = () => {
    if (exitTimer.current) return;
    if (!animateExit()) return close();
    setClosing(true);
    exitTimer.current = setTimeout(() => closeRef.current(), EXIT_MS);
  };
  const closeRef = useRef(close);
  const requestCloseRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = close;
    requestCloseRef.current = onClose;
  });

  useEffect(() => () => clearTimeout(exitTimer.current), []);

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    dialog.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => !element.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("modal-open");
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className={`overlay ${closing ? "closing" : ""}`.trim()}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`.trim()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
