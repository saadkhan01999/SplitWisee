import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
// Shared-store rate limiting. Counters live in the bounded `throttles` collection (unique `key`, TTL on `expiresAt`),
// so limits hold across processes, instances and restarts. Keys are SHA-256 digests; raw IPs/emails are never stored.
const digest = (x) => crypto.createHash("sha256").update(String(x)).digest("hex");

export class MongoRateLimitStore {
  constructor(collection, name) {
    this.collection = collection;
    this.prefix = `rl:${name}:`;
    this.localKeys = false;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key, retried = false) {
    const id = this.prefix + digest(key),
      now = new Date();
    const live = await this.collection.findOneAndUpdate(
      { key: id, resetAt: { $gt: now } },
      { $inc: { hits: 1 } },
      { returnDocument: "after" },
    );
    if (live) return { totalHits: live.hits, resetTime: live.resetAt };
    const resetAt = new Date(now.getTime() + this.windowMs);
    try {
      const fresh = await this.collection.findOneAndUpdate(
        { key: id, $or: [{ resetAt: { $lte: now } }, { resetAt: { $exists: false } }] },
        { $set: { hits: 1, resetAt, expiresAt: resetAt } },
        { upsert: true, returnDocument: "after" },
      );
      return { totalHits: fresh.hits, resetTime: fresh.resetAt };
    } catch (e) {
      // A concurrent request created the window first (unique key); count against it.
      if (e?.code === 11000 && !retried) return this.increment(key, true);
      throw e;
    }
  }
  async decrement(key) {
    await this.collection.updateOne(
      { key: this.prefix + digest(key), resetAt: { $gt: new Date() }, hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }
  async resetKey(key) {
    await this.collection.deleteOne({ key: this.prefix + digest(key) });
  }
}

const tooMany = (message) => (_req, res) => res.status(429).json({ error: message });
const ip = (req) => req.ip || req.socket?.remoteAddress || "unknown";

// Rate-limit classes referenced by the API documentation. Limits are per client IP unless stated.
export const LIMITS = {
  api: { windowMs: 60e3, limit: 180, message: "Too many requests. Please slow down." },
  login: {
    windowMs: 15 * 60e3,
    limit: 20,
    message: "Too many failed sign-in attempts from this network. Try again later.",
    skipSuccessfulRequests: true,
  },
  register: {
    windowMs: 60 * 60e3,
    limit: 20,
    message: "Too many sign-up attempts from this network. Try again later.",
  },
  verify: { windowMs: 15 * 60e3, limit: 30, message: "Too many verification attempts. Try again later." },
  resend: { windowMs: 60 * 60e3, limit: 10, message: "Too many code requests. Try again later." },
  resetRequest: { windowMs: 60 * 60e3, limit: 10, message: "Too many reset requests. Try again later." },
  reset: { windowMs: 15 * 60e3, limit: 20, message: "Too many reset attempts. Try again later." },
  quick: { windowMs: 60 * 60e3, limit: 30, message: "Too many verification requests. Try again later." },
  google: { windowMs: 15 * 60e3, limit: 20, message: "Too many sign-in attempts. Try again later." },
  upload: {
    windowMs: 60 * 60e3,
    limit: 60,
    message: "Too many receipt uploads. Try again later.",
    byUser: true,
  },
  operator: { windowMs: 10 * 60e3, limit: 30, message: "Too many operator requests. Try again later." },
};

export function createLimiters(collection) {
  const out = {};
  for (const [name, c] of Object.entries(LIMITS)) {
    out[name] = rateLimit({
      windowMs: c.windowMs,
      limit: c.limit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skipSuccessfulRequests: !!c.skipSuccessfulRequests,
      handler: tooMany(c.message),
      keyGenerator: c.byUser ? (req) => "user:" + (req.user?.id || ip(req)) : ip,
      // The global limiter stays per-process (cheap, protects each instance); all others are shared via MongoDB.
      ...(name === "api" ? {} : { store: new MongoRateLimitStore(collection, name), passOnStoreError: true }),
    });
  }
  return out;
}

// Programmatic quota for per-identifier caps (e.g. at most 3 reset emails per address per hour). Returns true if allowed.
export function createQuota(collection) {
  const stores = new Map();
  return async function consume(name, identifier, limit, windowMs) {
    if (!stores.has(name)) {
      const s = new MongoRateLimitStore(collection, "quota-" + name);
      s.init({ windowMs });
      stores.set(name, s);
    }
    const { totalHits } = await stores.get(name).increment(String(identifier).trim().toLowerCase());
    return totalHits <= limit;
  };
}
