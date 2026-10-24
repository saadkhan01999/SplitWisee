import nodemailer from "nodemailer";

// Demo deployments without email (DEMO_SHOW_CODES=true and no SMTP_HOST): the code goes back to the browser, which
// shows it on screen. Anyone who types an address can then use its code, so never enable this for real users.
export const showsCodesOnScreen = () => !process.env.SMTP_HOST && process.env.DEMO_SHOW_CODES === "true";

// Sends one-time codes. Without SMTP, codes are printed only in non-production with DEV_SHOW_EMAIL_CODES=true;
// otherwise the request fails with 503 and no account is pretended to be verified.
// Resolves to `{ demoCode }` when the code is shown on screen instead of emailed, otherwise to nothing.
export function createCodeSender({ production, override }) {
  return async function sendCode(address, subject, code) {
    if (override) return override(address, subject, code);
    if (showsCodesOnScreen()) return { demoCode: code };
    if (!process.env.SMTP_HOST) {
      if (!production && process.env.DEV_SHOW_EMAIL_CODES === "true") {
        console.info(JSON.stringify({ developmentEmail: address, subject, code }));
        return;
      }
      throw Object.assign(new Error("Email delivery is not configured."), { status: 503 });
    }
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : void 0,
    });
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to: address,
      subject: "SplitWisee: " + subject,
      text: `Your SplitWisee ${subject.toLowerCase()} code is:

${code}

Paste this code in the app. It expires in ${subject.includes("10 minute") ? "10" : "30"} minutes. If you did not request it, ignore this message.`,
    });
  };
}
