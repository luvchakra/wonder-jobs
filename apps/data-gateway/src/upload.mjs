import { ApiError, normalizeAll } from "./core.mjs";

/**
 * Partner uploads (owner, 2026-11-01): a partner who gave written permission (a therapist association, a craft
 * cooperative, a college placement cell…) sends its list, and an admin uploads it as CSV or JSON. The rows use one
 * fixed template, so nothing has to be mapped by hand:
 *
 *   id, title, organization, url, location | town, region, country, description, posted_at, organization_url, attr_*
 *
 * Every `attr_<name>` column is kept as the listing's own field <name> (an event's start date, a practitioner's
 * languages…). Rows are checked like any source's records; a partner refreshes its list by uploading again.
 */
export const UPLOAD_LIMITS = Object.freeze({ maxBytes: 2_000_000, maxRows: 5000, maxColumns: 40 });
export const UPLOAD_TEMPLATE_COLUMNS = ["id", "title", "organization", "url", "town", "region", "country", "description", "posted_at", "organization_url"];

/** CSV text → rows of named fields (first line is the header). Quotes, doubled quotes, CRLF and a BOM are handled. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > UPLOAD_LIMITS.maxRows + 1) break;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, UPLOAD_LIMITS.maxColumns);
  const records = rows.slice(1, UPLOAD_LIMITS.maxRows + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, records };
}

/** The upload's rows, from CSV or JSON (an array of objects, or { items: [...] }). */
export function uploadRows(format, content) {
  const text = String(content ?? "");
  if (!text.trim()) throw new ApiError(400, "INVALID_UPLOAD", "The file is empty");
  if (Buffer.byteLength(text) > UPLOAD_LIMITS.maxBytes) throw new ApiError(413, "TOO_LARGE", "The file must be under 2 MB");
  if (format === "csv") return parseCsv(text);
  if (format !== "json") throw new ApiError(400, "INVALID_UPLOAD", "Upload a CSV or JSON file");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new ApiError(400, "INVALID_UPLOAD", "The JSON could not be read"); }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
  if (!list) throw new ApiError(400, "INVALID_UPLOAD", "The JSON must be a list of rows (or { items: [...] })");
  const records = list.slice(0, UPLOAD_LIMITS.maxRows).filter((r) => r && typeof r === "object" && !Array.isArray(r)).map((r) => Object.fromEntries(Object.entries(r).slice(0, UPLOAD_LIMITS.maxColumns).map(([k, v]) => [String(k).trim().toLowerCase().replace(/\s+/g, "_"), typeof v === "string" ? v.trim() : v])));
  return { headers: [...new Set(records.flatMap((r) => Object.keys(r)))], records };
}

/** How the template's columns become a listing: fixed fields, plus every attr_* column as the listing's own field. */
export function uploadMapping(headers) {
  const has = (h) => headers.includes(h);
  const mapping = { id: has("id") ? "id" : "url", title: "title", employer: "organization", applyUrl: "url", description: "description", postedAt: "posted_at", organizationUrl: "organization_url", location: has("location") ? "location" : ["town", "region", "country"] };
  for (const h of headers) if (/^attr_\w{1,40}$/.test(h)) mapping["attr." + h.slice(5)] = h;
  return mapping;
}

/** An upload, checked: its listings and what was wrong with the rest (first few reasons, in words). */
export function uploadListings(source, format, content, observedAt = new Date().toISOString()) {
  const { headers, records } = uploadRows(format, content);
  if (!records.length) throw new ApiError(400, "INVALID_UPLOAD", "No rows found under the header");
  const missing = ["title", "url"].filter((h) => !headers.includes(h));
  if (missing.length) throw new ApiError(400, "INVALID_UPLOAD", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} (see the template)`);
  const shaped = { ...source, kind: "json_api", mapping: uploadMapping(headers) };
  const n = normalizeAll(shaped, records, observedAt);
  const problems = [];
  for (const [i, r] of records.entries()) {
    if (problems.length >= 5) break;
    const why = !String(r.title ?? "").trim() ? "no title" : !/^https:\/\//i.test(String(r.url ?? "")) ? "url must start with https://" : !String(r.organization ?? "").trim() && !source.organizationOptional ? "no organization" : null;
    if (why) problems.push(`Row ${i + 2}: ${why}`);
  }
  return { ...n, rows: records.length, columns: headers, problems };
}
