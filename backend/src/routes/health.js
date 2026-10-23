/** Liveness + database reachability for uptime monitors and reverse-proxy health checks. */
export function installHealth(app, { db }) {
  app.get("/api/health", async (_req, res) => {
    try {
      await db.command({ ping: 1 });
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
}
