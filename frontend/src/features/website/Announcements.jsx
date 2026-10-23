import { useEffect, useMemo, useState } from "react";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Operator-managed announcement carousel: previous/next/play/pause, pauses on hover or focus. */
export function Announcements({ settings }) {
  const slides = useMemo(() => {
    const maintenance = settings.maintenance
      ? [
          `Maintenance notice: ${settings.maintenanceMessage || "Some services may be temporarily unavailable."}`,
        ]
      : [];
    const announcements = settings.announcements?.length
      ? settings.announcements
      : settings.announcement
        ? [settings.announcement]
        : [];
    return [...maintenance, ...announcements].slice(0, 6);
  }, [settings]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const count = slides.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused || hovered || settings.announcementAutoplay === false || prefersReducedMotion())
      return undefined;
    const seconds = Math.max(5, Number(settings.announcementSeconds) || 8);
    const timer = setInterval(() => setIndex((value) => (value + 1) % count), seconds * 1000);
    return () => clearInterval(timer);
  }, [count, paused, hovered, settings.announcementAutoplay, settings.announcementSeconds]);

  if (!count) return null;

  const step = (delta) => {
    setPaused(true);
    setIndex((value) => (value + delta + count) % count);
  };

  return (
    <section
      className="public-announcement announcement-slider"
      aria-label="Announcements"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setPaused(true)}
    >
      <span className="announcement-label">LATEST UPDATE</span>
      <p key={current} aria-live={paused ? "polite" : "off"}>
        {slides[current]}
      </p>
      {count > 1 && (
        <div className="announcement-controls">
          <button type="button" aria-label="Previous announcement" onClick={() => step(-1)}>
            ←
          </button>
          <span>
            {current + 1} / {count}
          </span>
          <button type="button" aria-label="Next announcement" onClick={() => step(1)}>
            →
          </button>
          <button type="button" onClick={() => setPaused(!paused)}>
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      )}
    </section>
  );
}
