import { AnimatePresence, m } from "framer-motion";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { goToPage } from "../../app/navigationSlice.js";
import { Icon } from "../../components/Icon.jsx";
import { Logo } from "../../components/Logo.jsx";
import { Modal } from "../../components/Modal.jsx";
import { brand } from "../../config/brand.js";
import { formatLongDate } from "../../utils/format.js";
import { InstallAppButton, InstallGuide } from "../install/InstallGuide.jsx";
import { selectIsSignedIn } from "../session/sessionSlice.js";
import { Announcements } from "./Announcements.jsx";
import { CharitySection, PromoRibbon } from "./Campaigns.jsx";
import {
  EASE,
  lift,
  MotionProvider,
  press,
  Reveal,
  scrollToSection,
  Stagger,
  StaggerItem,
} from "./motion.jsx";
import { ScrollToTop, SiteHeader } from "./SiteHeader.jsx";
import {
  loadCampaigns,
  loadSiteSettings,
  selectCharity,
  selectPromotion,
  selectSiteSettings,
} from "./siteSlice.js";
import { SplitPreview } from "./SplitPreview.jsx";

const STEPS = [
  [
    "01",
    "Snap the receipt",
    "Upload a photo or PDF. We suggest the total and items, and you check them before saving.",
  ],
  [
    "02",
    "Make the split",
    "Choose who paid and who shares the cost. Split equally, by room, by item or your own rules.",
  ],
  [
    "03",
    "Close the month",
    "See who owes whom, track repayment confirmations and download a clear statement.",
  ],
];

const FAQS = [
  [
    "How do I get a month free?",
    "Sign up with a valid referral code or accept a household invitation as a new verified user and your first month is free. Share your own referral link: when another new user verifies their account, you earn another month. Sharing alone does not earn credit; self-referrals and repeat accounts do not qualify.",
  ],
  [
    "Do I need to connect my bank?",
    "No. Record expenses, keep your books and track repayments without a bank connection. You can optionally save private payee details. CoinSplit never moves money or reads bank transactions.",
  ],
  [
    "Can it read my receipts?",
    "Upload a clear photo or PDF. The scanner suggests the total, merchant, date and items for you to review. Faded, handwritten or unusual receipts may need manual entry, and your original file is always kept.",
  ],
  [
    "What does £0.99 cover?",
    "£0.99 per user per month covers shared expenses, receipt scanning, reports, bookkeeping and the installable mobile app. Each qualifying referral earns you a free month.",
  ],
  [
    "Can everyone see my bank details?",
    "No. Saved payee details are encrypted and private to your account. Household reports and exports never include bank account numbers.",
  ],
];

const STEP_ICONS = ["camera", "people", "check"];

/** What the product does, stated plainly (no invented numbers or testimonials). */
const HIGHLIGHTS = [
  ["settle", "Exact-pence splits", "Every share adds up to the penny."],
  ["shield", "No bank connection", "Record and settle without linking an account."],
  ["camera", "Receipt scanning", "Read on your device; originals kept privately."],
  ["download", "Professional exports", "Branded PDF, CSV and JSON records."],
];

export function LandingPage() {
  const dispatch = useDispatch();
  const site = useSelector(selectSiteSettings);
  const signedIn = useSelector(selectIsSignedIn);
  const promotion = useSelector(selectPromotion);
  const charity = useSelector(selectCharity);
  const [openFaq, setOpenFaq] = useState(0);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    dispatch(loadSiteSettings());
    dispatch(loadCampaigns());
  }, [dispatch]);

  useEffect(() => {
    document.title = site.seoTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", site.seoDescription);
  }, [site.seoTitle, site.seoDescription]);

  const start = () => dispatch(goToPage(signedIn ? "app" : "signup"));
  const signIn = () => dispatch(goToPage(signedIn ? "app" : "signin"));
  const links = [
    ["how", "How it works"],
    ["features", "Features"],
    ...(site.showPricing !== false ? [["pricing", "Pricing"]] : []),
    ...(charity.published ? [["giving-back", "Giving back"]] : []),
    ["faq", "FAQ"],
  ];
  const jump = (id) => (event) => {
    event.preventDefault();
    scrollToSection(id);
  };

  return (
    <MotionProvider>
      <div className="marketing">
        <PromoRibbon promotion={promotion} onClaim={start} />
        <SiteHeader links={links} signedIn={signedIn} onSignIn={signIn} onStart={start} />
        <Announcements settings={site} />

        <main>
          <section className="marketing-hero">
            <div className="hero-glow" aria-hidden="true">
              <i />
              <i />
            </div>
            <Stagger inView={false} gap={0.1}>
              <StaggerItem as="span" className="eyebrow">
                {site.eyebrow}
              </StaggerItem>
              <StaggerItem as="h1">
                {site.headline}
                <br />
                <em>{site.heroAccent}</em>
              </StaggerItem>
              <StaggerItem as="p">{site.heroDescription}</StaggerItem>
              <StaggerItem className="actions wrap">
                <m.button type="button" className="btn hero-cta" onClick={start} {...press}>
                  {signedIn ? "Open my household" : site.ctaLabel} →
                </m.button>
                {site.showInstall !== false && (
                  <InstallAppButton onShowGuide={() => setInstallOpen(true)} onOpenApp={signIn} />
                )}
              </StaggerItem>
              <StaggerItem className="hero-proof">
                <span>✓ £0.99 per user / month</span>
                <span>✓ No bank connection needed</span>
                <span>✓ Cancel any time</span>
              </StaggerItem>
            </Stagger>
            <m.div
              className="hero-preview-wrap"
              initial={{ opacity: 0, y: 36, rotate: 4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
            >
              <div className="hero-float">
                <SplitPreview onStart={start} />
              </div>
            </m.div>
          </section>

          <Stagger as="section" className="highlights" aria-label="Highlights">
            {HIGHLIGHTS.map(([icon, title, body]) => (
              <StaggerItem key={title} className="highlight" {...lift}>
                <span className="highlight-icon">
                  <Icon name={icon} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{body}</small>
                </span>
              </StaggerItem>
            ))}
          </Stagger>

          <section id="how" tabIndex={-1} className="marketing-section">
            <Reveal className="section-heading">
              <div>
                <span className="eyebrow">THREE SMALL STEPS</span>
                <h2>Less chasing. More living.</h2>
              </div>
              <p>Built for shared houses, families, flats and student homes.</p>
            </Reveal>
            <Stagger className="marketing-steps" gap={0.12}>
              {STEPS.map(([number, title, body], index) => (
                <StaggerItem as="article" key={number} {...lift}>
                  <div className="step-top">
                    <span className="step-icon">
                      <Icon name={STEP_ICONS[index]} />
                    </span>
                    <span className="step-number">{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </section>

          <section id="features" tabIndex={-1} className="marketing-section features-split">
            <Reveal>
              <span className="eyebrow">FAIR SHARES, WITHOUT THE MATHS</span>
              <h2>{site.featuresHeading}</h2>
              <p>
                The shopper and the payer are not always the same person. CoinSplit keeps those details
                separate, so the right people get paid back.
              </p>
              <Stagger className="feature-tags" gap={0.06}>
                {["Receipt scanning", "Monthly bookkeeping", "Professional PDFs", "Adjustable text size"].map(
                  (tag) => (
                    <StaggerItem as="span" key={tag}>
                      {tag}
                    </StaggerItem>
                  ),
                )}
              </Stagger>
            </Reveal>
            <Reveal delay={0.12} className="card split-feature-card" {...lift}>
              <h3>Every receipt. Every fair share.</h3>
              <p>
                Keep the original receipt, review the detected amount and choose exactly who shares the cost.
              </p>
              <div className="feature-tags">
                <span>Selected members</span>
                <span>Room-by-room splits</span>
                <span>Clear repayments</span>
              </div>
            </Reveal>
          </section>

          {site.showPricing !== false && (
            <Reveal as="section" id="pricing" tabIndex={-1} className="marketing-section pricing-section">
              <div>
                <span className="eyebrow">A SIMPLE PRICE FOR EVERYONE</span>
                <h2>{site.pricingHeading}</h2>
                <p>Invite someone new. When they verify their account, your next month can be on us.</p>
                <m.button type="button" className="btn" onClick={start} {...press}>
                  Create your account →
                </m.button>
              </div>
              <m.article className="price-card" {...lift}>
                {promotion.active && (
                  <p className="price-offer">
                    {promotion.title}: £0 for your first{" "}
                    {promotion.freeMonths === 1 ? "month" : `${promotion.freeMonths} months`} when claimed{" "}
                    {formatLongDate(promotion.startsAt)} – {formatLongDate(promotion.endsAt)}.
                  </p>
                )}
                <span>THE EVERYDAY PLAN</span>
                <h3>
                  £0.99<small>per user / month</small>
                </h3>
                <ul>
                  <li>Shared expenses &amp; flexible splits</li>
                  <li>Receipt scanning &amp; PDF records</li>
                  <li>Monthly bookkeeping &amp; exports</li>
                  <li>Referrals that earn free months</li>
                  <li>Optional private payee details</li>
                </ul>
                <p>No bank connection required. Cancel any time in the billing portal.</p>
              </m.article>
            </Reveal>
          )}

          {charity.published && (
            <Reveal>
              <CharitySection charity={charity} />
            </Reveal>
          )}

          <section id="faq" tabIndex={-1} className="marketing-section faq">
            <Reveal>
              <span className="eyebrow">GOOD QUESTIONS</span>
              <h2>Make yourself at home.</h2>
            </Reveal>
            <Stagger gap={0.06}>
              {FAQS.map(([question, answer], index) => (
                <StaggerItem key={question} className={openFaq === index ? "open" : undefined}>
                  <button
                    type="button"
                    aria-expanded={openFaq === index}
                    aria-controls={`faq-${index}`}
                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                  >
                    {question}
                    <m.span aria-hidden="true" animate={{ rotate: openFaq === index ? 45 : 0 }}>
                      +
                    </m.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {openFaq === index && (
                      <m.div
                        key="answer"
                        className="faq-answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                      >
                        <p id={`faq-${index}`}>{answer}</p>
                      </m.div>
                    )}
                  </AnimatePresence>
                </StaggerItem>
              ))}
            </Stagger>
          </section>

          <Reveal as="section" className="marketing-end">
            <span className="eyebrow">YOUR NEXT CHAPTER, SHARED.</span>
            <h2>A calmer home starts here.</h2>
            <p>Shared expenses, fair splits and clear monthly settlements, for £0.99 per user per month.</p>
            <m.button type="button" className="btn" onClick={start} {...press}>
              Let’s get started →
            </m.button>
          </Reveal>
        </main>

        <footer className="site-footer">
          <div className="footer-grid">
            <div className="footer-brand">
              <Logo />
              {site.footerText !== brand.tagline && <p>{site.footerText}</p>}
              <p className="caption">
                Shared household expenses, receipt scanning and fair monthly settlements for homes, families
                and friends.
              </p>
            </div>
            <nav aria-label="Product">
              <strong>Product</strong>
              {links.map(([id, label]) => (
                <a key={id} href={`#${id}`} onClick={jump(id)}>
                  {label}
                </a>
              ))}
            </nav>
            <nav aria-label="Account">
              <strong>Account</strong>
              <button type="button" onClick={signIn}>
                {signedIn ? "Open my household" : "Sign in"}
              </button>
              {!signedIn && (
                <button type="button" onClick={start}>
                  Create an account
                </button>
              )}
              <button type="button" onClick={() => setInstallOpen(true)}>
                Install the app
              </button>
            </nav>
            <nav aria-label="Support and legal">
              <strong>Support</strong>
              {site.supportEmail && <a href={`mailto:${site.supportEmail}`}>Contact support</a>}
              {site.privacyUrl && (
                <a href={site.privacyUrl} target="_blank" rel="noopener noreferrer">
                  Privacy
                </a>
              )}
              {site.termsUrl && (
                <a href={site.termsUrl} target="_blank" rel="noopener noreferrer">
                  Terms
                </a>
              )}
              <a href="/admin/">Operator sign in</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {brand.name}. All rights reserved.
            </span>
            {charity.published && (
              <a href="#giving-back" onClick={jump("giving-back")}>
                {charity.percent}% of our {charity.basis} goes to charity
              </a>
            )}
            <span>v{brand.version}</span>
          </div>
        </footer>

        <ScrollToTop />
        {installOpen && (
          <Modal title="CoinSplit on your phone" onClose={() => setInstallOpen(false)}>
            <InstallGuide />
          </Modal>
        )}
      </div>
    </MotionProvider>
  );
}
