# WorksLake External Data Gateway (MVP)

Standalone Node.js 22 service with no third-party runtime dependencies. All eight datasets are supported as API namespaces; no source is collected or activated by default. API / RSS / JSON-LD extraction is allowed only after a source-specific permission review. This is not an authentication, anti-bot or terms bypass.

## Local setup

1. Set GATEWAY_ADMIN_TOKEN and GATEWAY_CURSOR_SECRET to two different random secrets, each at least 32 characters. Never commit them. Set GATEWAY_DATA_FILE to a persisted private file path.
2. Run: npm run gateway:start. The gateway binds to 127.0.0.1:8790 by default.
3. With the admin bearer token, POST /v1/admin/keys, sending consumerId=workslake and scopes containing read:jobs, read:internships, read:teaching, read:services, read:therapists, read:cofounders, read:events and read:marketplace. Save the returned key once as WORKSLAKE_GATEWAY_API_KEY on the WonderWorks backend.
4. Register a source via POST /v1/admin/sources, providing an HTTPS URL, source kind (json_api, rss, structured), module IDs, reviewed permission and redistribution evidence, terms, structured mapping if applicable and retention.
5. Sources start disabled. Call POST /v1/admin/sources/:id/test, review the real result, then POST /v1/admin/sources/:id/activate. Set GATEWAY_COLLECTORS_ENABLED=1 to perform scheduled background pulls on an isolated worker process.
6. Publish behind a TLS reverse proxy (the proposed data.wonderapps.biz hostname does not yet exist as part of this PR). Set WORKSLAKE_GATEWAY_URL to the public HTTPS root, WORKSLAKE_GATEWAY_ENABLED=1 and WORKSLAKE_GATEWAY_API_KEY in WonderWorks. Eight draft WorksLake JSON API sources appear. Run the existing WorksLake source test and explicitly activate each source independently.

## API surface

- POST /v1/search: JSON body with module, query, locations, limit and signed cursor.
- GET /v1/workslake/:module/listings: compatibility endpoint; parameters q, location and limit; returns items suitable for WorksLake's unchanged JSON source mapper.
- GET /v1/modules, /v1/sources?module=jobs, /v1/listings/:id, /v1/usage, /v1/health.
- Admin: GET/POST /v1/admin/keys, POST /v1/admin/keys/:id/rotate, POST /v1/admin/keys/:id/revoke, POST /v1/admin/sources, POST /v1/admin/sources/:id/test, /activate, /pause and /refresh.

Every API key has module-specific read permissions and can be revoked or rotated. External consumer keys are disabled unless GATEWAY_ALLOW_EXTERNAL_CONSUMERS=1, and each source must explicitly permit downstream redistribution.

## Important constraints

- Existing WorksLake source code paths, UI, saved ids and search interfaces are retained. The gateway is an additional source in Draft only.
- Source-dated listings are passed to WorksLake Protocol v1; missing dates stay null in the gateway rather than being invented. Undated profiles are excluded from the WorksLake compatibility endpoint until its protocol changes.
- The gateway does not hold source permissions automatically and does not seed fake listings.
- Existing platform partner portal Do not use entries remain unchanged.
- Tests: npm run gateway:check (Node syntax and unit suites). Existing root npm test now runs gateway tests.

## Production limitations

This is an isolated **single-instance MVP**, not a publicly scalable service. Its JSON file store persists across process restarts on one mounted persistent disk only; multi-replica operation can corrupt state. Before production, migrate to PostgreSQL transactions, distributed job queue/locks and distributed rate limiting, replace the minimal OpenAPI stub with a complete schema, run source licensing/privacy reviews, add monitoring and verify production deployment behind TLS. No external API consumers should be provisioned before those controls are in place.
