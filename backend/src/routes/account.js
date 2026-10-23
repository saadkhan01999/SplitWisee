import { cleanProfile, profileView } from "../models/profile.js";
export function installAccount(app, { db, session, endpoint, safeUser }) {
  const users = db.collection("users");
  app.get("/api/v1/account/profile", session, (req, res) => res.json(profileView(req.user)));
  app.post(
    "/api/v1/account/profile",
    session,
    endpoint(async (req, res) => {
      const { name, ...profile } = cleanProfile(req.body);
      await users.updateOne({ id: req.user.id }, { $set: { name, profile, updatedAt: new Date() } });
      res.json({
        profile: profileView({ ...req.user, name, profile }),
        user: safeUser({ ...req.user, name, profile }),
      });
    }),
  );
  app.get(
    "/api/v1/account/export",
    session,
    endpoint(async (req, res) =>
      res.json({
        format: "splitwisee-personal-v1",
        exportedAt: new Date().toISOString(),
        profile: profileView(req.user),
        referralCode: req.user.referralCode || null,
        subscriptionStatus: req.user.subscription?.status || null,
      }),
    ),
  );
}
