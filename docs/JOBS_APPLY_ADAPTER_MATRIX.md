# JobsApply — adapter matrix (spec §146–§148, §162)

_2026-09-25._ Every adapter runs in the candidate's own browser, through the WonderJobs helper.

- No authorized, documented application API is configured for any provider, so no adapter uses one (§3, §61–§63).
- Submission is **candidate-controlled** for every row. There is no code path that submits.
- A status is based on fixture tests. It is never based on URL detection, and no live employer portal is tested (§146, §150).

| Adapter | Status | Fixture (`apps/web/e2e/fixtures/portals`) | Detect | Inspect | Map | Fill | Upload | Intervention | Multi-step | Submission detection | Fallback |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Generic reader | Supported with limitations | `mock-generic`, `mock-login`, `mock-payment`, `mock-broken` | ✅ | ✅ | ✅ | ✅ | ✅ (choose field) | ✅ salary, metric, consent, résumé-field choice | — | ✅ | Guided mode ✅ |
| Greenhouse | Supported with limitations | `mock-greenhouse` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ work auth, EEO | — | ✅ `GH-12345` | Generic → guided |
| Lever | Supported with limitations | `mock-lever` | ✅ | ✅ | ✅ full name, org, LinkedIn | ✅ | ✅ | ✅ sponsorship radio untouched | — | ✅ `LV-777001` | Generic → guided |
| Ashby | Supported with limitations | `mock-ashby` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ disability untouched | — | ✅ `AB-55120` | Generic → guided |
| Workday | User-assisted only | `mock-workday` | ✅ | ✅ | ✅ | ✅ | ✅ (step 2) | ✅ work auth | ✅ step 1 → 2 | ✅ `WD-REQ-4410` | Generic → guided |
| SmartRecruiters | User-assisted only | none yet | URL only (unit) | generic | generic | generic | generic | generic | — | generic | Guided |
| Workable | User-assisted only | none yet | URL only (unit) | generic | generic | generic | generic | generic | — | generic | Guided |

## How each row is tested

In `e2e/jobs-apply.spec.ts` → "Adapter contract ADAPTER-001…010":

1. The real extension is loaded.
2. The fixture is served as the demo job's employer page.
3. The candidate clicks Fill.
4. The test asserts:
   - profile values were filled;
   - the résumé was attached;
   - sensitive questions were left untouched;
   - on Workday, the next step was read and filled;
   - nothing was submitted before the candidate's click.
5. The candidate answers the human-only question and submits.
6. WonderJobs shows the confirmation number as evidence.

Provider detection from a URL is unit-tested for all nine providers (`jobsApply.test.ts`).

Workday is kept at *user-assisted only*: real Workday tenants need an account the candidate creates themselves, and they use custom widgets.
