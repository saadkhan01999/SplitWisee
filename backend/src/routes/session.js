// Current identity (with the per-session CSRF token) and sign-out (server-side session revocation).
export function installSessionRoutes(app, { session, endpoint, sessions, cookieName, production, safeUser }) {
  app.get("/api/v1/me", session, (req, res) =>
    res.json({ user: safeUser(req.user), csrf: req.session.csrf }),
  );
  app.post(
    "/api/v1/auth/logout",
    session,
    endpoint(async (req, res) => {
      await sessions.deleteOne({ id: req.session.id });
      res.clearCookie(cookieName, { httpOnly: true, secure: production, sameSite: "strict", path: "/" });
      res.json({ ok: true });
    }),
  );
}
