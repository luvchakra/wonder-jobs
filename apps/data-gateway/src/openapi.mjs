import { MODULES } from "./core.mjs";

const module = { type: "string", enum: [...MODULES] };
const error = (description) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const ok = (schema, description = "OK") => ({ description, content: { "application/json": { schema } } });
const ref = (name) => ({ $ref: "#/components/schemas/" + name });
const bearer = [{ bearer: [] }], admin = [{ admin: [] }];
const consumerErrors = { 401: error("Missing, invalid, revoked or expired API key"), 403: error("The key has no read scope for this module"), 429: { ...error("Over the key's per-minute allowance"), headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds until the allowance renews" } } } };
const idParam = (name) => ({ name, in: "path", required: true, schema: { type: "string" } });

/** The gateway's API, described. A test checks that every path here is one the server answers. */
export const OPENAPI = {
  openapi: "3.1.0",
  info: { title: "WorksLake Data Gateway", version: "0.2.0", description: "Read-only, module-scoped listings from reviewed external sources. A listing's id is stable; its module is fixed; a key reads only the modules it was issued for." },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "A consumer API key (wlg_…), shown once when issued." }, admin: { type: "http", scheme: "bearer", description: "The administrator token." } },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } },
      Listing: { type: "object", required: ["id", "module", "title", "organization", "canonicalUrl", "observedAt"], properties: { id: { type: "string" }, module, title: { type: "string" }, organization: { type: "string" }, location: { type: "string" }, description: { type: "string" }, canonicalUrl: { type: "string", format: "uri" }, publishedAt: { type: ["string", "null"], format: "date-time", description: "As the source states it; null when it does not." }, observedAt: { type: "string", format: "date-time" }, remote: { type: "boolean" }, sourceId: { type: "string" }, sourceName: { type: "string" }, sourceMethod: { type: "string" }, source: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, method: { type: "string" } } } } },
      SearchRequest: { type: "object", required: ["module"], properties: { module, query: { type: "string", maxLength: 200 }, locations: { type: "array", maxItems: 10, items: { type: "string" } }, limit: { type: "integer", minimum: 1, maximum: 100, default: 50 }, cursor: { type: "string", description: "nextCursor from the previous page; only valid for the same module, query and locations." } } },
      SearchResponse: { type: "object", properties: { requestId: { type: "string" }, module, results: { type: "array", items: ref("Listing") }, nextCursor: { type: ["string", "null"] }, metadata: { type: "object", properties: { totalReturned: { type: "integer" }, matched: { type: "integer" }, sourceCount: { type: "integer" }, cacheStatus: { type: "string" }, asOf: { type: "string", format: "date-time" } } } } },
      KeyRequest: { type: "object", required: ["scopes"], properties: { consumerId: { type: "string", default: "workslake" }, scopes: { type: "array", items: { type: "string", pattern: "^read:(" + MODULES.join("|") + ")$" } }, expiresAt: { type: "string", format: "date-time" } } },
      SourceRequest: { type: "object", required: ["url", "kind", "modules", "permission", "permissionEvidence", "termsReviewed", "redistributionAllowed"], properties: { url: { type: "string", format: "uri" }, kind: { enum: ["json_api", "rss", "structured"] }, modules: { type: "array", items: module }, permission: { enum: ["terms_permit", "granted_in_writing"] }, permissionEvidence: { type: "string", minLength: 8 }, termsReviewed: { const: true }, redistributionAllowed: { const: true }, externalRedistributionAllowed: { type: "boolean" }, robotsReviewed: { type: "boolean" }, consentVerified: { type: "boolean" }, attribution: { type: "string" }, itemsPath: { type: "string" }, mapping: { type: "object", additionalProperties: { type: "string" } }, retentionHours: { type: "integer", minimum: 1, maximum: 720 }, minIntervalMinutes: { type: "integer", minimum: 15, maximum: 10080 } } },
    },
  },
  paths: {
    "/v1/health": { get: { summary: "Liveness", security: [], responses: { 200: ok({ type: "object" }) } } },
    "/v1/openapi.json": { get: { summary: "This document", security: [], responses: { 200: ok({ type: "object" }) } } },
    "/v1/modules": { get: { summary: "The modules this key may read", security: bearer, responses: { 200: ok({ type: "object", properties: { modules: { type: "array", items: module } } }), ...consumerErrors } } },
    "/v1/sources": { get: { summary: "Active sources for a module", security: bearer, parameters: [{ name: "module", in: "query", required: true, schema: module }], responses: { 200: ok({ type: "object" }), 400: error("Unsupported module"), ...consumerErrors } } },
    "/v1/search": { post: { summary: "Module-scoped search, newest first", security: bearer, requestBody: { required: true, content: { "application/json": { schema: ref("SearchRequest") } } }, responses: { 200: ok(ref("SearchResponse")), 400: error("Invalid module or cursor"), ...consumerErrors } } },
    "/v1/workslake/{module}/listings": { get: { summary: "Feed in WorksLake's JSON-source shape (dated listings only)", security: bearer, parameters: [idParam("module"), { name: "q", in: "query", schema: { type: "string" } }, { name: "location", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } }], responses: { 200: ok({ type: "object", properties: { items: { type: "array", items: { type: "object" } } } }), ...consumerErrors } } },
    "/v1/listings/{id}": { get: { summary: "One listing by id", security: bearer, parameters: [idParam("id")], responses: { 200: ok({ type: "object", properties: { listing: ref("Listing") } }), 404: error("Gone, expired or not available to this key"), ...consumerErrors } } },
    "/v1/usage": { get: { summary: "This consumer's own request counts", security: bearer, responses: { 200: ok({ type: "object" }), ...consumerErrors } } },
    "/v1/admin/keys": {
      get: { summary: "API keys (never the secret)", security: admin, responses: { 200: ok({ type: "object" }), 401: error("Administrator authentication required") } },
      post: { summary: "Issue a key; the secret is returned once", security: admin, requestBody: { required: true, content: { "application/json": { schema: ref("KeyRequest") } } }, responses: { 201: ok({ type: "object" }), 400: error("Invalid request"), 401: error("Administrator authentication required"), 403: error("External consumers are disabled") } },
    },
    "/v1/admin/consumers": { get: { summary: "Consumers", security: admin, responses: { 200: ok({ type: "object" }), 401: error("Administrator authentication required") } } },
    "/v1/admin/keys/{id}/rotate": { post: { summary: "Issue a replacement and revoke the old key", security: admin, parameters: [idParam("id")], responses: { 201: ok({ type: "object" }), 404: error("No active key with this id"), 401: error("Administrator authentication required") } } },
    "/v1/admin/keys/{id}/revoke": { post: { summary: "Revoke a key", security: admin, parameters: [idParam("id")], responses: { 200: ok({ type: "object" }), 404: error("Unknown key"), 401: error("Administrator authentication required") } } },
    "/v1/admin/sources": {
      get: { summary: "Sources", security: admin, responses: { 200: ok({ type: "object" }), 401: error("Administrator authentication required") } },
      post: { summary: "Register a source (starts paused)", security: admin, requestBody: { required: true, content: { "application/json": { schema: ref("SourceRequest") } } }, responses: { 201: ok({ type: "object" }), 400: error("Invalid request"), 403: error("Permission or consent not documented"), 401: error("Administrator authentication required") } },
    },
    "/v1/admin/sources/{id}/test": { post: { summary: "Fetch once and report quality; stores nothing", security: admin, parameters: [idParam("id")], responses: { 200: ok({ type: "object" }), 401: error("Administrator authentication required"), 404: error("Unknown source") } } },
    "/v1/admin/sources/{id}/activate": { post: { summary: "Start collecting; needs a passing test in the last 24 hours", security: admin, parameters: [idParam("id")], responses: { 200: ok({ type: "object" }), 409: error("Passing test required"), 401: error("Administrator authentication required"), 404: error("Unknown source") } } },
    "/v1/admin/sources/{id}/pause": { post: { summary: "Stop collecting", security: admin, parameters: [idParam("id")], responses: { 200: ok({ type: "object" }), 401: error("Administrator authentication required"), 404: error("Unknown source") } } },
    "/v1/admin/sources/{id}/refresh": { post: { summary: "Collect now (active sources only)", security: admin, parameters: [idParam("id")], responses: { 200: ok({ type: "object" }), 409: error("Paused or already running"), 401: error("Administrator authentication required"), 404: error("Unknown source") } } },
  },
};
