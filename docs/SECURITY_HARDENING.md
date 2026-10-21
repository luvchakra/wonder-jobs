# Hardening against AI-assisted reverse engineering

What protects WonderJobs from someone using an AI model or agent to read, crawl and rebuild it (WJ-334, 2026-10-21).

## In code

| Control | Where |
|---|---|
| No production source maps (`.map` returns 403) | Next.js default; `next.config.ts` doesn't enable them |
| Model instructions held on the server; the browser names a prompt id | `server/ai/systemPrompts.ts`, `app/api/ai/complete/route.ts` |
| Every prompt ends with a guard; replies that repeat instructions are refused | `SYSTEM_GUARD`, `leaksInstructions` |
| Browser code never imports server code | `src/clientBoundary.test.ts` |
| Security headers (CSP with `frame-ancestors 'none'`, `object-src 'none'`; HSTS; nosniff; Referrer-Policy; COOP), no `X-Powered-By` | `next.config.ts` |
| robots.txt: AI crawlers turned away from everything; product paths disallowed | `app/robots.ts`, `lib/robots.ts` |
| `noindex, nofollow` + `noai, noimageai` on signed-in and operator pages | `PRIVATE_PAGE` in `lib/robots.ts` |
| Rate limits per tenant or address, 429 with Retry-After, refusals logged | `server/rateLimit.ts` and each route |
| Scraping watch: logs an address passing 1,500 API calls or 300 distinct pages an hour (log only) | `server/activityWatch.ts`, `proxy.ts` |
| Generic error messages to clients; details in server logs | API routes |
| Help text says what people do, not scoring weights | `content/help.ts` |

## Canary data

These invented postings exist only in the demo dataset (`services/mock/universe.ts`, `CANARIES`). Finding either name anywhere else means the demo data was copied.

- **Quillfeather Mapworks (sample)**: "Cartography Data Steward", Pune, `quillfeather-mapworks.example`
- **Tamarind Lighthouse Co. (sample)**: "Tidal Archive Curator", Kochi, `tamarind-lighthouse.example`

## Owner actions

Repository visibility, the hosting firewall, legal terms and sign-up policy need account access or a decision. See the pull request for WJ-334.
