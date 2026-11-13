import { grantWelcome } from "../services/promotions.js";
import { roomNames } from "../modules/households/index.js";
import { uid } from "../modules/calculation-engine/index.js";
export function installInvitations(
  app,
  { db, session, endpoint, load, requireMember, email, fail, token, hash, platform },
) {
  const users = db.collection("users"),
    tokens = db.collection("tokens"),
    households = db.collection("households");
  // Invitation history for the platform audit; recipients are never stored here.
  const logInvitation = (entry) => db.collection("invitationEvents").insertOne({ id: uid(), ...entry });
  app.post(
    "/api/v1/households/:id/invites",
    session,
    endpoint(async (req, res) => {
      const s = await load(req);
      const member = requireMember(s, req.user.id);
      // Every active member may invite; invitations never grant an elevated role.
      const e = email(req.body.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !/^\+[1-9]\d{7,14}$/.test(e))
        fail("Enter a valid email or international mobile number.");
      const room = String(req.body.room || member.room);
      if (!roomNames(s).includes(room)) fail("Choose an existing room.");
      const raw = token();
      const now = new Date();
      await tokens.insertOne({
        id: hash(raw),
        type: "invite",
        householdId: s.id,
        invitedBy: req.user.id,
        recipient: e,
        room,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 864e5),
      });
      await logInvitation({ status: "created", householdId: s.id, invitedBy: req.user.id, at: now });
      res.status(201).json({ token: raw, expiresInDays: 7 });
    }),
  );
  app.post(
    "/api/v1/invites/accept",
    session,
    endpoint(async (req, res) => {
      // Each failure gets its own recovery message; the link is single-purpose, single-use and recipient-bound.
      const t = await tokens.findOne({ id: hash(String(req.body.token || "")), type: "invite" });
      if (!t)
        fail(
          "This invitation link is not valid or has expired. Ask the household for a new invitation.",
          404,
        );
      if (t.usedAt) {
        if (t.usedBy === req.user.id) return res.json({ ok: true, householdId: t.householdId });
        fail("This invitation has already been used. Ask the household for a new invitation.", 410);
      }
      if (new Date(t.expiresAt) <= new Date())
        fail("This invitation has expired (links last 7 days). Ask the household for a new invitation.", 410);
      const intended = t.recipient ?? t.email;
      if (![req.user.email, req.user.phone].filter(Boolean).includes(intended))
        fail(
          "This invitation was sent to a different email or phone number. Sign in with that account, or ask for a new invitation.",
          403,
        );
      const source = await households.findOne({ id: t.householdId });
      if (!source || source.suspended) fail("Household unavailable.", 403);
      if (t.invitedBy && !source.members.some((m) => m.id === t.invitedBy && !m.left))
        fail("The inviter no longer has access. Request a new invitation.", 403);
      if (!roomNames(source).includes(t.room))
        fail("This invitation’s room changed. Request a new invitation.", 409);
      const joined = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
      const inviter = source.members.find((m) => m.id === t.invitedBy);
      // Atomic join: the members filter prevents a double join without depending on the household version, so a
      // concurrent household edit no longer turns a valid acceptance into "household not found".
      const result = await households.updateOne(
        {
          id: t.householdId,
          suspended: { $ne: true },
          "members.id": { $ne: req.user.id },
        },
        {
          $push: {
            members: { id: req.user.id, name: req.user.name, role: "member", room: t.room, joined },
            audit: {
              $each: [
                {
                  id: uid(),
                  actorId: req.user.id,
                  action: "member joined",
                  detail: inviter ? `${req.user.name} (invited by ${inviter.name})` : req.user.name,
                  at: /* @__PURE__ */ new Date().toISOString(),
                },
              ],
              $position: 0,
            },
          },
          $inc: { version: 1 },
        },
      );
      if (!result.matchedCount) {
        const s = await households.findOne({ id: t.householdId });
        requireMember(s, req.user.id);
        if (s.suspended) fail("Household is suspended.", 403);
      }
      await grantWelcome(db, req.user, "invitation");
      if (
        t.invitedBy &&
        t.invitedBy !== req.user.id &&
        req.user.createdAt &&
        Date.now() - new Date(req.user.createdAt) <= 7 * 864e5
      ) {
        await users.updateOne(
          { id: req.user.id, referredBy: { $in: [null] } },
          { $set: { referredBy: t.invitedBy, referredVia: "invitation" } },
        );
        await platform.qualify(await users.findOne({ id: req.user.id }));
      }
      // Kept (not deleted) until it expires, so a reused link says "already used" instead of "invalid".
      await tokens.updateOne({ id: t.id }, { $set: { usedAt: new Date(), usedBy: req.user.id } });
      if (result.matchedCount)
        await logInvitation({
          status: "accepted",
          householdId: t.householdId,
          invitedBy: t.invitedBy,
          userId: req.user.id,
          at: new Date(),
        });
      res.json({ ok: true, householdId: t.householdId });
    }),
  );
}
