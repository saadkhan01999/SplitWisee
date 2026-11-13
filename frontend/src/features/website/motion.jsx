import { LazyMotion, MotionConfig, domAnimation, m } from "framer-motion";

// Motion for the public website (Framer Motion). LazyMotion loads only the DOM animation features, and
// reducedMotion="user" turns movement off for visitors who ask their device for less motion.

export const EASE = [0.22, 1, 0.36, 1];

// Scroll reveals need IntersectionObserver; where it is missing (very old browsers, test DOMs) content simply
// animates in straight away instead of waiting to be scrolled into view.
const canObserve = typeof window !== "undefined" && typeof window.IntersectionObserver === "function";
const onView = (margin) =>
  canObserve ? { whileInView: "visible", viewport: { once: true, margin } } : { animate: "visible" };

export function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.55, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

const rise = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ as = "div", delay = 0, className, children, ...props }) {
  const Component = m[as];
  return (
    <Component
      className={className}
      initial="hidden"
      {...onView("0px 0px -12% 0px")}
      variants={{ ...rise, visible: { ...rise.visible, transition: { ...rise.visible.transition, delay } } }}
      {...props}
    >
      {children}
    </Component>
  );
}

/** A group whose children (StaggerItem) appear one after another. */
export function Stagger({ as = "div", className, children, gap = 0.09, inView = true, ...props }) {
  const Component = m[as];
  const trigger = inView ? onView("0px 0px -10% 0px") : { animate: "visible" };
  return (
    <Component
      className={className}
      initial="hidden"
      {...trigger}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: gap } } }}
      {...props}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({ as = "div", className, children, ...props }) {
  const Component = m[as];
  return (
    <Component className={className} variants={rise} {...props}>
      {children}
    </Component>
  );
}

/** Gentle lift on hover and press, for cards and buttons. */
export const lift = {
  whileHover: { y: -4, transition: { type: "spring", stiffness: 320, damping: 22 } },
  whileTap: { scale: 0.985 },
};
export const press = {
  whileHover: { scale: 1.025, transition: { type: "spring", stiffness: 380, damping: 20 } },
  whileTap: { scale: 0.97 },
};

const reduce = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smoothly scrolls to a page section (or the top), leaving room for the sticky header. */
export function scrollToSection(id) {
  const behavior = reduce() ? "auto" : "smooth";
  if (!id) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const target = document.getElementById(id);
  if (!target) return;
  const header = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - header - 12, behavior });
  window.history.replaceState(null, "", `#${id}`);
  target.focus?.({ preventScroll: true });
}
