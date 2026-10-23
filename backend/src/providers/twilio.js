// Twilio Verify (SMS / WhatsApp one-time codes). Optional; unavailable unless all three variables are set.
export const twilioConfigured = () =>
  !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );

export async function twilioVerify(resource, params) {
  const bad = (m, status) => {
    throw Object.assign(new Error(m), { status });
  };
  if (!twilioConfigured()) bad("Mobile/WhatsApp verification is not configured.", 503);
  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/${resource}`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN).toString(
            "base64",
          ),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15e3),
    },
  );
  const d = await r.json();
  if (!r.ok) bad("Verification provider could not complete the request. Please try again.", 400);
  return d;
}
