const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

function contentSecurityPolicy(apiOrigin) {
  const connect = ["'self'", apiOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${apiOrigin || ""}`.trim(),
    `connect-src ${connect}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function seoTags({ siteUrl, title, description }) {
  if (!siteUrl) return "";
  const image = `${siteUrl}/icon-512.png`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SplitWisee",
    url: `${siteUrl}/`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description,
    offers: { "@type": "Offer", price: "0.99", priceCurrency: "GBP" },
  }).replaceAll("<", "\\u003c");
  return [
    `<link rel="canonical" href="${siteUrl}/">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="SplitWisee">`,
    `<meta property="og:locale" content="en_GB">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${siteUrl}/">`,
    `<meta property="og:image" content="${image}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<script type="application/ld+json">${jsonLd}</script>`,
  ].join("\n    ");
}

/**
 * Fills the static HTML head: title, description and social tags from the default website settings, a
 * Content-Security-Policy for production builds, and robots.txt / sitemap.xml for the public site URL.
 */
export function siteMeta({ siteUrl, apiOrigin, title, description }) {
  let production = false;
  return {
    name: "splitwisee:site-meta",
    configResolved(config) {
      production = config.command === "build";
      if (production && !siteUrl)
        config.logger.warn(
          "VITE_SITE_URL is not set: canonical and social URLs, and the sitemap, are left out of this build.",
        );
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const csp = production
          ? `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(apiOrigin)}">`
          : "";
        return html
          .replace("<!-- csp -->", csp)
          .replace("<!-- seo -->", seoTags({ siteUrl, title, description }))
          .replaceAll("%SEO_TITLE%", escapeHtml(title))
          .replaceAll("%SEO_DESCRIPTION%", escapeHtml(description));
      },
    },
    generateBundle() {
      const robots = ["User-agent: *", "Allow: /", "Disallow: /admin/"];
      if (siteUrl) {
        robots.push(`Sitemap: ${siteUrl}/sitemap.xml`);
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            `  <url><loc>${siteUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
            "</urlset>\n",
        });
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots.join("\n") + "\n" });
    },
  };
}
