import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { goToPage } from "../../app/navigationSlice.js";
import { Logo } from "../../components/Logo.jsx";
import { Modal } from "../../components/Modal.jsx";
import { brand } from "../../config/brand.js";
import { InstallAppButton, InstallGuide } from "../install/InstallGuide.jsx";
import { AppViewSwitch } from "../preferences/AppViewSwitch.jsx";
import { selectIsSignedIn } from "../session/sessionSlice.js";
import { Announcements } from "./Announcements.jsx";
import { loadSiteSettings, selectSiteSettings } from "./siteSlice.js";
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
    "No. Record expenses, keep your books and track repayments without a bank connection. You can optionally save private payee details. SplitWisee never moves money or reads bank transactions.",
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

export function LandingPage() {
  const dispatch = useDispatch();
  const site = useSelector(selectSiteSettings);
  const signedIn = useSelector(selectIsSignedIn);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    dispatch(loadSiteSettings());
  }, [dispatch]);

  useEffect(() => {
    document.title = site.seoTitle;
    document.querySelector('meta[name="description"]')?.setAttribute("content", site.seoDescription);
  }, [site.seoTitle, site.seoDescription]);

  const start = () => dispatch(goToPage(signedIn ? "app" : "signup"));
  const signIn = () => dispatch(goToPage(signedIn ? "app" : "signin"));

  return (
    <div className="marketing">
      <header
        className="marketing-nav"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMenuOpen(false);
        }}
      >
        <a href="#" className="wordmark" aria-label={`${brand.name} home`}>
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
        <div id="marketing-menu" className="marketing-menu" data-open={menuOpen}>
          <nav aria-label="Website" onClick={() => setMenuOpen(false)}>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            {site.showPricing !== false && <a href="#pricing">Pricing</a>}
          </nav>
          <div className="account-actions">
            <AppViewSwitch onMobile={signIn} />
            {signedIn ? (
              <button type="button" className="btn" onClick={signIn}>
                Open my household
              </button>
            ) : (
              <>
                <button type="button" className="btn outline" onClick={signIn}>
                  Sign in
                </button>
                <button type="button" className="btn" onClick={start}>
                  Sign up ↗
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <Announcements settings={site} />

      <main>
        <section className="marketing-hero">
          <div>
            <span className="eyebrow">{site.eyebrow}</span>
            <h1>
              {site.headline}
              <br />
              <em>{site.heroAccent}</em>
            </h1>
            <p>{site.heroDescription}</p>
            <div className="actions wrap">
              <button type="button" className="btn" onClick={start}>
                {signedIn ? "Open my household" : site.ctaLabel} →
              </button>
              {site.showInstall !== false && (
                <InstallAppButton onShowGuide={() => setInstallOpen(true)} onOpenApp={signIn} />
              )}
            </div>
            <div className="hero-proof">
              <span>✓ £0.99 per user / month</span>
              <span>✓ No bank connection needed</span>
            </div>
          </div>
          <SplitPreview onStart={start} />
        </section>

        <section id="how" className="marketing-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THREE SMALL STEPS</span>
              <h2>Less chasing. More living.</h2>
            </div>
            <p>Built for shared houses, families, flats and student homes.</p>
          </div>
          <div className="marketing-steps">
            {STEPS.map(([number, title, body]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="marketing-section features-split">
          <div>
            <span className="eyebrow">FAIR SHARES, WITHOUT THE MATHS</span>
            <h2>{site.featuresHeading}</h2>
            <p>
              The shopper and the payer are not always the same person. SplitWisee keeps those details
              separate, so the right people get paid back.
            </p>
            <div className="feature-tags">
              <span>Receipt scanning</span>
              <span>Monthly bookkeeping</span>
              <span>Professional PDFs</span>
              <span>Adjustable text size</span>
            </div>
          </div>
          <div className="card split-feature-card">
            <h3>Every receipt. Every fair share.</h3>
            <p>
              Keep the original receipt, review the detected amount and choose exactly who shares the cost.
            </p>
            <div className="feature-tags">
              <span>Selected members</span>
              <span>Room-by-room splits</span>
              <span>Clear repayments</span>
            </div>
          </div>
        </section>

        {site.showPricing !== false && (
          <section id="pricing" className="marketing-section pricing-section">
            <div>
              <span className="eyebrow">A SIMPLE PRICE FOR EVERYONE</span>
              <h2>{site.pricingHeading}</h2>
              <p>Invite someone new. When they verify their account, your next month can be on us.</p>
              <button type="button" className="btn" onClick={start}>
                Create your account →
              </button>
            </div>
            <article className="price-card">
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
            </article>
          </section>
        )}

        <section className="marketing-section faq">
          <span className="eyebrow">GOOD QUESTIONS</span>
          <h2>Make yourself at home.</h2>
          {FAQS.map(([question, answer], index) => (
            <div key={question}>
              <button
                type="button"
                aria-expanded={openFaq === index}
                aria-controls={`faq-${index}`}
                onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
              >
                {question}
                <span aria-hidden="true">{openFaq === index ? "−" : "+"}</span>
              </button>
              {openFaq === index && <p id={`faq-${index}`}>{answer}</p>}
            </div>
          ))}
        </section>

        <section className="marketing-end">
          <span className="eyebrow">YOUR NEXT CHAPTER, SHARED.</span>
          <h2>A calmer home starts here.</h2>
          <button type="button" className="btn" onClick={start}>
            Let’s get started →
          </button>
        </section>
      </main>

      <footer className="marketing-footer">
        <strong>{brand.name}</strong>
        <span>{site.footerText}</span>
        <a href="/admin/">Operator sign in</a>
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
        {site.supportEmail && <a href={`mailto:${site.supportEmail}`}>Contact support</a>}
        <span>v{brand.version}</span>
      </footer>

      {installOpen && (
        <Modal title="SplitWisee on your phone" onClose={() => setInstallOpen(false)}>
          <InstallGuide />
        </Modal>
      )}
    </div>
  );
}
