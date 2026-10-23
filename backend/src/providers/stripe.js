import Stripe from "stripe";
// Stripe is optional: null when STRIPE_SECRET_KEY is absent, and every billing route then refuses with 503.
export function stripeClient() {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
}
