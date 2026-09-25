# JobsApply — implementation audit (spec §151 Phase 0)

_2026-09-25._ Spec: `WONDERJOBS_JOBS_APPLY_FULL_IMPLEMENTATION_SPEC.md`, plus a six-screen mockup (Job details → Method → Connect → Review → Final review & submit → Submitted).

## 1. Where the spec, the mockup and CLAUDE.md agree, and where they don't

The spec and CLAUDE.md agree:

- "Wonder fills. You review and submit." (§10)
- "SUBMISSION MUST REQUIRE CANDIDATE ACTION" (§67)
- "Do not store third-party portal passwords" (§13, §14, §34, §35)
- "Never bypass CAPTCHA/MFA" (§33, §76)
- "Never auto-answer sensitive/legal questions" (§22, §166)
- Auto-submit is only an optional future setting, "never enable by default" (§68, §112)

CLAUDE.md goes further: the apply stage must never gain the ability to submit **at any automation level**. So §68/§112 ("future auto-submit") are **not built**, and no setting for them is shown.

The mockup conflicts with both documents in three places. Each is built the way the spec and CLAUDE.md require:

| Mockup | Why it can't ship as drawn | What ships instead |
|---|---|---|
| Method card "Auto apply on company portal — Wonder logs in and securely fills… (Recommended)" | Wonder never logs in for the candidate or submits (spec §3, §35; CLAUDE.md) | "Fill it in with the browser helper": the candidate's own browser, on the employer's own site. Recommended only when the helper is installed. |
| Screen 3 "Connect to Google Careers": email + password form, "credentials are encrypted and not stored" | Spec §14 says the extension should not ask for the portal password. Spec §35 says: "Wonder does not need your portal password." | "Sign in on the employer's site": Open sign-in → the candidate signs in there (SSO or password, on the employer's page) → the helper sees the form. There is no password field anywhere in WonderJobs. |
| Screen 5 "Submit Application" button inside WonderJobs → Screen 6 "Application submitted!" | "submitted" is set only by the candidate's own confirmation (CLAUDE.md). Wonder never clicks Submit (§53, §67). | "Submit on the employer's site" focuses the employer's tab. Then "Did you submit the application? Yes / Not yet / I'm not sure" (§54). Only "Yes" marks it submitted. A confirmation page the helper saw is shown as evidence; it never marks the application submitted on its own. |

Also in the mockup: work authorization pre-filled as "India". Work authorization is HUMAN_ONLY (§21). It is never filled; it appears in "Needs you".

## 2. What exists today

| Area | Today | File(s) | Gap vs spec |
|---|---|---|---|
| Job detail CTA | "Prepare application" + "View original posting" | `app/app/jobs/[id]/page.tsx` | No "Apply with Wonder" (§4) |
| Application Pack | Résumé / cover letter / answers artifacts with versions and provenance; "Continue to Employer" opens `applyUrl`; "Mark as submitted" | `domain/applications/*`, `app/app/applications/[id]/prepare/page.tsx`, `[id]/page.tsx` | No preflight, readiness gate, session, duplicate check, guided copy list or pack export |
| Résumé templates | 8 templates, PDF/DOCX, saved résumés with template version | `domain/resume/*`, `services/resume/*` | Not selectable as the file to upload |
| Tracker | `Application.status` incl. `submitted`, events, follow-ups, `submissionKey` | `store/applications.ts` | Needs submission evidence and a JobsApply timeline |
| Workflow `apply` stage | Hand-off only, gated by `resolveCapability("submit_application")`, ledgered with idempotency key | `services/workflow/executors.ts` | Unchanged. JobsApply is candidate-initiated, outside a run, and keeps the same limit. |
| Automation policy | `resolveCapability` over 12 capabilities | `domain/automation/policy.ts` | No capability for filling forms |
| External-action ledger / audit | `store/actions.ts`, `/api/audit` (`action_audit`) | — | Reused for the hand-off |
| **Browser extension (MV3)** | Exists. Bridge mints a 30-min tenant token. Autofills name, email, résumé DOCX and cover letter on Greenhouse/Lever/Ashby, plus a generic label pass. In-page panel. Never submits. | `extension/*`, `/api/extension/{token,profile,application}`, `server/extensionToken.ts` | No sessions, no form schema, no classification/intervention, no stop, no domain/CAPTCHA/MFA/payment guards, no submission detection, only 6 concepts. Token is tenant-wide, not per session. |
| Contact facts | `CareerDNA.history.contact` (email, phone, location, LinkedIn, portfolio, website), added with résumé templates | `domain/career/history.ts` | `MISSING_CANDIDATE_FIELDS` still says phone/LinkedIn/location are never held. That is now stale. |
| JobsLake | Canonical opportunities with sightings (URL, provider, employer source) | `domain/jobs/types.ts` `JobLakeProvenance` | Supplies the apply destination and provider (§58–60) |
| Server state | Per-tenant JSON docs (`app_state`), no store-name constraint in SQL | `server/state.ts` | Needs a store that only the server writes |

Work authorization, sponsorship, salary expectation, notice period and relocation are **not held anywhere**. Nothing is invented for them (spec §8). They become "Needs you".

## 3. Design decisions

1. **A session is server-owned.** Sessions live in a new `wj.jobsapply` document written only by `/api/jobs-apply/*`. `/api/state` PUT rejects it, so the browser can't overwrite server-recorded evidence.
   - Every route filters by the session's tenant, or by the tenant inside the session token.
   - No migration is needed: `app_state.store` is unconstrained text.
2. **The Application Pack is snapshotted at start (§107).** The snapshot holds:
   - the profile values with provenance;
   - the résumé chosen (the tailored DOCX, or a saved template PDF with template id and version);
   - the cover letter;
   - approved answers;
   - the application version.

   The helper fills from this snapshot, never from live state, so the session is reproducible.
3. **One mapper, server-side.** The helper sends only the form's *structure* (labels, types, options, required, autocomplete, name/id hints), never a value typed on the page. The server classifies and maps it with `domain/jobs-apply` (TypeScript, unit-tested). The server returns values only for fields that are SAFE_AUTOFILL at HIGH confidence, or that the candidate confirmed.
4. **Filling is a gated capability.** The new `fill_application` capability (medium risk, default *ask*) goes through `resolveCapability`:
   - *off* means guided mode only;
   - *ask* means the helper shows "Fill N fields" and waits for the click;
   - *automatic* at an eligible level means it fills on detection.

   The server evaluates the policy from the tenant's stored automation state. If it's missing, the answer is *ask* (fails closed). Opening the employer page is the existing `submit_application` hand-off, which is gated and ledgered as before.
5. **No submit path exists.** The helper has no code that clicks a submit control or calls `form.submit()`/`requestSubmit()`, and a unit test scans the extension source for them. "Submitted" is set only by the candidate's "Yes, application submitted". Helper-detected confirmation pages are evidence (LIKELY/VERIFIED), shown to the candidate.
6. **Session-scoped helper token (§90).** An HMAC token binds tenant, session id and a per-session nonce, expiring after 30 minutes. It is rejected when:
   - the nonce was rotated (Stop / revoke);
   - the session is terminal;
   - it has expired.

   It grants access to that one session's endpoints only.
7. **Values are never logged (§88).** The audit trail and admin telemetry record field *category*, action and outcome. The helper never reads password, OTP or payment fields; it only detects that they exist.
8. **The extension is extended, not duplicated (§155).** It keeps the existing bridge, token route and fallback autofill for pages without a session.

## 4. Out of scope (not faked)

- **Authorized application APIs (§62–65).** WonderJobs has no documented, authorized candidate-side application API for any provider. The provider registry records every provider's method as `browser`, and no API adapter is registered. The admin page says so.
- **Auto-submit (§68, §112).** Excluded by CLAUDE.md, as above.
- **Chrome `sidePanel` API.** The existing in-page shadow-DOM panel, docked right, serves as the side panel (§94). The Chrome Side Panel would need a new permission and a store review.
- **Confirmation-email evidence (§55).** Not built: WonderJobs has no mailbox access.
