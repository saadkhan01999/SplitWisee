import crypto from "node:crypto";
// Consecutive-failure locks for guessable secrets (account passwords, operator TOTP codes).
//
// Rules (owner requirement, v1.2.7):
// - At most MAX_FAILURES (4) consecutive failed attempts per normalised identifier within WINDOW_MS (15 min,
//   measured from the latest attempt). The 4th failure starts a LOCK_MS (15 min) temporary lock. No permanent lock.
// - Each attempt is reserved atomically *before* the password/TOTP check, so N parallel requests can never test more
//   than MAX_FAILURES guesses.
// - Only a successful verified sign-in or a controlled recovery (password reset) clears the counter.
// - Unknown identifiers are throttled exactly like real ones, so the lock reveals nothing about account existence.
// Documents live in `throttles`: {key: sha256 digest, failures, lastAttemptAt, lockedUntil, expiresAt (TTL)}.
export const MAX_FAILURES = 4,
  WINDOW_MS = 15 * 60e3,
  LOCK_MS = 15 * 60e3;
const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
export const throttleKey = (kind, identifier) =>
  `lock:${kind}:` +
  digest(
    String(identifier ?? "")
      .trim()
      .toLowerCase(),
  );

export function createAuthThrottle(collection, { now = () => Date.now() } = {}) {
  const expiry = (t) => new Date(t + WINDOW_MS + LOCK_MS);
  // Returns {allowed, attempt, retryAfter (seconds)}.
  async function reserve(kind, identifier) {
    const key = throttleKey(kind, identifier),
      t = now(),
      at = new Date(t);
    const current = await collection.findOne({ key });
    if (current?.lockedUntil && +current.lockedUntil > t)
      return { allowed: false, key, retryAfter: Math.ceil((+current.lockedUntil - t) / 1000) };
    // Stale window or expired lock: start counting again from zero.
    if (
      current &&
      ((current.lockedUntil && +current.lockedUntil <= t) || +current.lastAttemptAt < t - WINDOW_MS)
    ) {
      await collection.updateOne(
        { key, lastAttemptAt: current.lastAttemptAt },
        { $set: { failures: 0 }, $unset: { lockedUntil: "" } },
      );
    }
    let doc = null;
    // E11000 means the key already exists but the filter excluded it: either it is locked, or a concurrent first
    // attempt created it a moment ago. One retry distinguishes the two (a locked key collides again).
    for (let tries = 0; tries < 2 && !doc; tries++) {
      try {
        doc = await collection.findOneAndUpdate(
          { key, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: at } }] },
          { $inc: { failures: 1 }, $set: { lastAttemptAt: at, expiresAt: expiry(t) } },
          { upsert: true, returnDocument: "after" },
        );
      } catch (e) {
        if (e?.code !== 11000) throw e;
      }
    }
    if (!doc) {
      const locked = await collection.findOne({ key });
      return {
        allowed: false,
        key,
        retryAfter: Math.max(1, Math.ceil(((+locked?.lockedUntil || t + LOCK_MS) - t) / 1000)),
      };
    }
    if (doc.failures > MAX_FAILURES) {
      await lock(key, t);
      return { allowed: false, key, retryAfter: Math.ceil(LOCK_MS / 1000) };
    }
    return { allowed: true, key, attempt: doc.failures };
  }
  async function lock(key, t = now()) {
    await collection.updateOne(
      { key, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: new Date(t) } }] },
      { $set: { lockedUntil: new Date(t + LOCK_MS), expiresAt: expiry(t) } },
    );
  }
  // Called after a failed check. Returns the number of attempts left before the lock (0 = now locked).
  async function failed(reservation) {
    if (reservation.attempt >= MAX_FAILURES) {
      await lock(reservation.key);
      return 0;
    }
    return MAX_FAILURES - reservation.attempt;
  }
  // The secret was correct but sign-in did not complete (e.g. unverified email): do not count it as a failure.
  async function release(reservation) {
    await collection.updateOne({ key: reservation.key, failures: { $gt: 0 } }, { $inc: { failures: -1 } });
  }
  async function clear(kind, identifier) {
    if (identifier) await collection.deleteOne({ key: throttleKey(kind, identifier) });
  }
  return { reserve, failed, release, clear };
}

export function lockedError(retryAfter, message) {
  return Object.assign(new Error(message), { status: 429, retryAfter });
}
