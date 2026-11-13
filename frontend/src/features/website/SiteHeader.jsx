import { AnimatePresence, m, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { Logo } from "../../components/Logo.jsx";
import { brand } from "../../config/brand.js";
import { AppViewSwitch } from "../preferences/AppViewSwitch.jsx";
import { EASE, press, scrollToSection } from "./motion.jsx";

/** Highlights the section currently in the middle of the screen. */
function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  const key = ids.join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const id of key.split(",")) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/**
 * Sticky website header: transparent at the top, frosted with a shadow once the page scrolls, with a reading
 * progress line, the section in view highlighted and an animated menu on smaller screens.
 */
export function SiteHeader({ links, signedIn, onSignIn, onStart }) {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.3 });
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useActiveSection(links.map(([id]) => id));

  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  // From the phone menu, scroll only once the menu has finished closing: scrolling while it collapses would aim
  // at a position that moves under the visitor.
  const [pending, setPending] = useState(null);
  const go = (id) => (event) => {
    event.preventDefault();
    if (menuOpen) {
      setPending({ id });
      setMenuOpen(false);
    } else scrollToSection(id);
  };
  const afterMenuClosed = () => {
    if (!pending) return;
    setPending(null);
    scrollToSection(pending.id);
  };

  const actions = (
    <div className="account-actions">
      <AppViewSwitch onMobile={onSignIn} />
      {signedIn ? (
        <m.button type="button" className="btn" onClick={onSignIn} {...press}>
          Open my household
        </m.button>
      ) : (
        <>
          <m.button type="button" className="btn outline" onClick={onSignIn} {...press}>
            Sign in
          </m.button>
          <m.button type="button" className="btn" onClick={onStart} {...press}>
            Sign up ↗
          </m.button>
        </>
      )}
    </div>
  );

  const nav = (
    <nav aria-label="Website">
      {links.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          className={active === id ? "active" : undefined}
          aria-current={active === id ? "location" : undefined}
          onClick={go(id)}
        >
          {label}
        </a>
      ))}
    </nav>
  );

  return (
    <header
      className={["site-header", scrolled && "scrolled", menuOpen && "menu-open"].filter(Boolean).join(" ")}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenuOpen(false);
      }}
    >
      <div className="marketing-nav">
        <a href="#" className="wordmark" aria-label={`${brand.name} home`} onClick={go(null)}>
          <Logo />
        </a>
        <button
          type="button"
          className="btn outline marketing-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="marketing-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Close menu" : "Menu"}
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
        <div className="marketing-menu desktop-menu">
          {nav}
          {actions}
        </div>
        <AnimatePresence initial={false} onExitComplete={afterMenuClosed}>
          {menuOpen && (
            <m.div
              id="marketing-menu"
              className="marketing-menu mobile-menu"
              data-open="true"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              {nav}
              {actions}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <m.div className="scroll-progress" style={{ scaleX: progress }} aria-hidden="true" />
    </header>
  );
}

/** Floating "back to top" button, shown after scrolling down a screen. */
export function ScrollToTop() {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setVisible(y > 600));

  return (
    <AnimatePresence>
      {visible && (
        <m.button
          type="button"
          className="scroll-top"
          aria-label="Back to top"
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            scrollToSection(null);
            document.querySelector(".site-header .wordmark")?.focus({ preventScroll: true });
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              d="M12 19V5M5 12l7-7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </m.button>
      )}
    </AnimatePresence>
  );
}
