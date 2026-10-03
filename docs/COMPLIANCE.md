# WonderJobs — payments, privacy, financial controls and security

Status as of 2026-10-02 (WJ-166). This is the map from each requirement to the code that meets it, the operator
steps needed to turn it on, and what is **not** done. Landing-page and legal-page copy must stay consistent with
this file — if a control here changes, change the copy in `components/landing/TrustSection.tsx`,
`app/(marketing)/{privacy,security,terms,cookies}` and `content/privacy.ts` with it.

---

## 1. Payments — Razorpay and Stripe

| Requirement | How it's met | Code |
|---|---|---|
| Hosted checkout, no card data on our servers (PCI DSS SAQ A scope) | Stripe Checkout Session (`mode=subscription`) and Razorpay Subscription `short_url`; the browser is redirected to the provider | `server/billing/stripe.ts`, `server/billing/razorpay.ts` |
| No hardcoded prices | Amount, currency and interval are read from the provider (`GET /v1/prices/:id`, `GET /v1/plans/:id`), cached 10 min | `service.ts::providerAvailability` |
| Honest unavailable states | Missing env → `needs_setup` (variable names only); provider error → `unavailable` with a fixed description (provider text can quote the key, so it is logged, not shown) | `config.ts::missingBillingEnv`, `stripe.ts::describeProviderError` |
| Webhook authenticity | Stripe: `t=…,v1=HMAC(secret, t.payload)` with 5-minute replay tolerance. Razorpay: `HMAC(secret, body)`. Constant-time compare (`server/crypto.ts::safeEqual`). Missing secret → 503, never "trust anyway" | `stripe.ts::verifyStripeSignature`, `razorpay.ts::verifyRazorpaySignature` |
| Entitlement decided by the server only | Plan comes from `billing_subscriptions`, written only by verified webhooks or reconciliation. The checkout redirect changes nothing. The old client-writable `career.plan` field is no longer read | `domain/billing/subscription.ts::entitlementFor`, `service.ts::hasPro`, `store/billing.ts` |
| Idempotency | Stripe: the signed event id (`evt_…`). Razorpay: the SHA-256 of the signed body — its `x-razorpay-event-id` header is not covered by the signature, so a captured body replayed under a fresh id would otherwise count as new. Unique in the ledger; a redelivery is acknowledged and not re-applied once the subscription already reflects it. Stripe checkout creation sends an `Idempotency-Key` | `append_billing_event`, `service.ts::ingest`, `startCheckout` |
| Out-of-order and hostile events | Any event older than the last applied one is ignored (`stale`) — payments too, so an old invoice can't re-activate a stopped subscription; a failed payment only moves `active` → `past_due`; an event naming a different tenant than the stored owner is refused (`tenant_mismatch`); an event for an erased account is ledgered but never re-creates it (`erased_account`) | `applyBillingEvent` |
| Cancellation | Stripe: hosted billing portal. Razorpay: cancel at cycle end via API, written to the action audit (requested / succeeded / failed) and reflected at once through a ledgered `wonderjobs.cancel_requested` event; unpaid Razorpay links expire after 7 days | `service.ts::cancelSubscription`, `/api/billing/{portal,cancel}` |
| Recurring-payment rules (India) | RBI e-mandate / additional factor authentication and UPI AutoPay are handled by Razorpay on its hosted page | Razorpay |

**Operator setup**
1. Stripe: create a Product + recurring Price → `STRIPE_PRICE_ID`; `STRIPE_SECRET_KEY`; add webhook endpoint
   `https://<domain>/api/billing/webhooks/stripe` for `checkout.session.completed`, `customer.subscription.*`,
   `invoice.paid`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`. Enable the Customer Portal.
2. Razorpay: create a Plan → `RAZORPAY_PLAN_ID`; API keys → `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`; webhook
   `https://<domain>/api/billing/webhooks/razorpay` for `subscription.*` → `RAZORPAY_WEBHOOK_SECRET`.
3. Apply migration `0008_billing_privacy_controls.sql` (`POST /api/admin/migrate`).
4. Decide what Pro unlocks and gate it with `hasPro(tenantId)` on the server. **Today Pro unlocks nothing
   extra**; the plan card shows the provider's own product name and description, so do not describe features
   there that aren't gated.

## 2. Privacy — GDPR (EU/UK) and DPDP Act 2023 (India)

| Requirement | GDPR | DPDP | How it's met | Code |
|---|---|---|---|---|
| Notice | Art. 13 | s.5 | Versioned notice; signed-in users accept it (and confirm 18+) before continuing; re-asked when the version changes | `app/(marketing)/privacy`, `content/privacy.ts::PRIVACY_NOTICE_VERSION`, `components/privacy/PrivacyNoticeGate.tsx`, `/api/privacy/consent` |
| Consent records | Art. 7(1) | s.6(10) | Append-only `consent_records` (no updates, trigger-enforced) | migration 0008, `server/privacy/records.ts` |
| Lawful basis per purpose | Art. 6 | s.6, s.7(a) | Listed in the notice ("Why, and on what basis") | privacy page |
| Access / portability | Art. 15, 20 | s.11 | Profile → Your data → Download my data: one JSON with app data, server data, key metadata (never ciphertext), audit, contact messages, billing, consents, requests | `/api/privacy/export`, `subjectRights.ts::buildExport` |
| Correction | Art. 16 | s.12 | In-app editing; anything else via contact form topic "Privacy request" | |
| Erasure | Art. 17 | s.12 | Profile → Your data → Delete account (typed confirmation). Deletes tenant row (cascades every tenant table), contact messages, Supabase Auth user. Refused while a subscription would keep charging. A tombstone (the hashed completed request) stops late webhooks and other devices' still-valid tokens (≤1 h) from re-creating the account: state writes answer 410 | `/api/privacy/erase`, `subjectRights.ts::eraseAccount` |
| Retention exceptions | Art. 17(3)(b) | s.8(7) | Billing ledger (8 years, no FK so it survives erasure, no profile data) and a hashed request record | migration 0008 |
| Storage limitation | Art. 5(1)(e) | s.8(7) | Published schedule; contact messages purged after 24 months by the daily cron | `content/privacy.ts::RETENTION`, `server/privacy/retention.ts` |
| Processors | Art. 28, 30 | s.8(2) | Published list incl. Razorpay, Stripe, Resend, push services | `content/privacy.ts::SUB_PROCESSORS` |
| Children | Art. 8 | s.9 | 18+ only; confirmed at notice acceptance; terms updated | |
| Grievance officer / contact | Art. 37–39 (DPO if required) | s.8(10) | From `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` / `NEXT_PUBLIC_PRIVACY_EMAIL`; without them, the contact form topic "Privacy request" | `grievanceContact()` |
| Nomination | — | s.14 | Handled as a request through the grievance contact | privacy page |
| Cookies | ePrivacy | — | Strictly necessary only → no banner; cookies page corrected (session cookie is JS-readable, not HttpOnly) | `app/(marketing)/cookies` |
| Data minimisation in logs | Art. 5(1)(c) | s.8(5) | Contact route and notifier no longer log names, addresses or messages | `api/contact`, `server/notify.ts` |

### Breach response (GDPR Art. 33–34, DPDP s.8(6))
1. Contain: rotate the affected secret (`SECRET_ENCRYPTION_KEY`, Supabase service key, provider keys, webhook secrets), revoke sessions in Supabase.
2. Assess within 24 hours: what data, whose, how many, likely consequences. Preserve logs.
3. Notify: the Data Protection Board of India and each affected Data Principal without delay (DPDP Rules: initial
   report promptly, detailed report within 72 hours); the competent EU/UK supervisory authority within 72 hours
   where the GDPR applies; affected people directly when the risk is high.
4. Record the incident, decisions and notifications; review controls afterwards.

## 3. Financial controls (SOX-style)

WonderJobs is not an issuer under the Sarbanes-Oxley Act and has not been audited. These are the IT general
controls (ITGC) and application controls a SOX 404 audit would test, implemented for the billing flow.

| Control | Implementation |
|---|---|
| Completeness & accuracy of financial events | Every verified webhook (including ignored types) is ledgered with amount, currency, provider ids and a SHA-256 of the raw payload |
| Integrity / non-repudiation | Hash chain (`prev_hash`, `hash`) computed in the database under an advisory lock; `verifyLedgerChain` re-derives it (unit test pins the SQL hash) |
| Immutability | Triggers refuse UPDATE/DELETE/TRUNCATE on `billing_ledger` and `privacy_requests`, and UPDATE on `action_audit` and `consent_records` — for the service role too |
| Reconciliation | Daily, in the cron: every open subscription (paged, including ones awaiting a first confirmation) is checked against the provider's live status; drift is corrected and ledgered (`reconciliation.<status>`) |
| Segregation of duties | `BILLING_AUDITOR_TOKEN`: read-only verify + CSV export (`/api/admin/billing-ledger`), separate from deploy, migration (service-role key) and cron secrets |
| Change management | All changes through PRs with CI (lint, typecheck, tests, build, dependency audit); schema only via versioned migrations whose registry is test-checked against the SQL |
| Access control | Supabase security advisor clean for WonderJobs objects (migration 0009 pinned `forbid_mutation`'s search_path; migration 0011 revoked EXECUTE on Supabase's `public.rls_auto_enable()` event-trigger function from anon/authenticated/service_role/PUBLIC — the `ensure_rls` trigger still enables RLS on new `public` tables; the remaining "RLS enabled, no policy" notices are the deliberate server-only design). Service-role key server-side only; no anon/authenticated grants on any table; ledger function `execute` granted to `service_role` only |
| Retention | At least 8 years (Companies Act 2013 s.128; CGST Act s.36). Not deleted automatically afterwards yet (the table refuses deletes) — see gaps |
| PCI DSS | Out of scope beyond SAQ A: hosted payment pages only |

## 4. IT security

| Area | Change | Code |
|---|---|---|
| Open redirect | `?next=` resolved against a fixed origin; `/\evil.com`, `/..//evil.com` dot-segment collapse, tab/newline tricks, absolute URLs rejected — applied in the proxy, auth form, auth callback, onboarding, demo enter/exit | `lib/safeRedirect.ts` (+ tests) |
| Security headers | CSP (Vercel preview toolbar allowed), HSTS (2y), X-Frame-Options DENY + `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy (mic self only), COOP `same-origin-allow-popups` (keeps the apply flow's handle on the employer tab), no `X-Powered-By` | `next.config.ts` |
| CSRF | Proxy refuses cookie-authenticated API mutations whose `Origin` isn't this host or whose `Sec-Fetch-Site` is cross-site; bearer and server-to-server calls pass | `lib/csrf.ts`, `proxy.ts` |
| Decompression bombs | 16 MB per inflated entry, 48 MB total per PDF; content-length checked before reading uploads | `server/resume/extractText.ts`, `api/career/import-resume` |
| Uploaded résumé files | Checked by bytes (real PDF/.docx; no encryption, JavaScript/Launch/embedded files/XFA — including inside compressed object streams — macros or ActiveX); ≤ 3 MB, ≤ 5 per account; AES-256-GCM under an HKDF key used only for these files, account + file id bound as AAD; explicit tenant filter on every query; attachment-only download with `nosniff`; upload/delete audited; listed in export, removed on erasure | `server/resume/{fileValidation,files}.ts`, `api/resume-files`, migration 0010 |
| Rate limiter memory | Idle sweep + LRU cap of 50k keys | `server/rateLimit.ts` |
| Error leakage | State, audit and billing routes log details server-side and return fixed messages | |
| Key separation | Secret-store encryption key derived with HKDF (`v2:` format); legacy ciphertexts still decrypt | `server/secrets.ts` |
| Constant-time secrets | `safeEqual` hashes both sides (no length leak); cron uses it | `server/crypto.ts` |
| Vulnerable dependency | `next` 16.3.5 → 16.3.8 (critical RCE advisory in `next/og` ImageResponse, used by the icon/OG routes) | `package.json` |
| Supply chain | CI dependency audit: production dependencies fail on high or critical (`npm audit --omit=dev --audit-level=high`), build/lint tooling on critical (split 2026-10-03: GHSA-vfj7-8cjw-p6xm in `braces`, no patched release, reaches us only via `eslint-config-next`), `permissions: contents: read`, Dependabot for npm and Actions | `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| Disclosure | RFC 9116 `/.well-known/security.txt`; "Report a security issue" contact topic | |

## 5. Known gaps (not done)

- Billing ledger and privacy-request records are kept at least 8 years but nothing deletes them afterwards (deletion would need a controlled, audited exception to the append-only trigger).
- The privacy-notice gate is enforced in the browser; the API doesn't refuse requests from an account that hasn't accepted the current version.

- Session cookie is JS-readable by design of the Supabase browser client; CSP still allows `'unsafe-inline'` scripts (nonce-based CSP would force dynamic rendering of every page).
- Rate limits are per instance (no shared store).
- Calendar feed URLs can't be rotated independently; HMAC tokens still share the master secret (changing that would break existing subscriptions).
- GitHub Actions are pinned to tags, not commit SHAs; no CodeQL (needs GitHub Advanced Security on a private repo).
- Legacy no-auth mode still issues an anonymous identity if Supabase Auth is unconfigured in production.
- No DPO appointed / named in code; set the grievance env vars before launch in the EU or India.
- What Pro unlocks is a product decision not yet made (see §1 step 4).
- `npm run e2e` / `npm run a11y` need real Supabase credentials and were not run for this change; the notice gate and erasure flow need a real-account run before relying on them in production.
