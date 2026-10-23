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
      await tokens.insertOne({
        id: hash(raw),
        type: "invite",
        householdId: s.id,
        invitedBy: req.user.id,
        recipient: e,
        room,
        expiresAt: new Date(Date.now() + 7 * 864e5),
      });
      res.status(201).json({ token: raw, expiresInDays: 7 });
    }),
  );
  app.post(
    "/api/v1/invites/accept",
    session,
    endpoint(async (req, res) => {
      const t = await tokens.findOne({
        id: hash(String(req.body.token || "")),
        type: "invite",
        $or: [
          { recipient: req.user.email || "__none__" },
          { recipient: req.user.phone || "__none__" },
          { email: req.user.email || "__none__" },
        ],
        expiresAt: { $gt: /* @__PURE__ */ new Date() },
      });
      if (!t) fail("Invitation is invalid, expired, or belongs to a different email.", 403);
      const source = await households.findOne({ id: t.householdId });
      if (!source || source.suspended) fail("Household unavailable.", 403);
      if (t.invitedBy && !source.members.some((m) => m.id === t.invitedBy && !m.left))
        fail("The inviter no longer has access. Request a new invitation.", 403);
      if (!roomNames(source).includes(t.room))
        fail("This invitation’s room changed. Request a new invitation.", 409);
      const joined = /* @__PURE__ */ new Date().toISOString().slice(0, 10);
      const result = await households.updateOne(
        {
          id: t.householdId,
          version: source.version,
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
                  detail: req.user.name,
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
          { $set: { referredBy: t.invitedBy } },
        );
        await platform.qualify(await users.findOne({ id: req.user.id }));
      }
      await tokens.deleteOne({ id: t.id });
      res.json({ ok: true, householdId: t.householdId });
    }),
  );
}
