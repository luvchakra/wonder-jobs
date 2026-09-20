/**
 * The site's own absolute origin.
 *
 * Link previews (WhatsApp, Slack, iMessage, X…) fetch `og:image` by URL, so
 * every one of those has to be absolute — Next builds them from
 * `metadataBase`, and without it emits relative URLs that no scraper can
 * resolve. Resolution order: an explicit override, then Vercel's own
 * production domain (set even on preview deployments), then the current
 * deployment's URL, then localhost for development.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return new URL(`https://${production}`);
  const deployment = process.env.VERCEL_URL;
  if (deployment) return new URL(`https://${deployment}`);
  return new URL("http://localhost:3000");
}
