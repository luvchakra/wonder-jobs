#!/usr/bin/env python3
"""
Overture Maps Places collection for the businesses dataset (WJ-817, docs/PROSPECT_DATA_API.md, package A5), run by
GitHub Actions (overture-collect.yml), not by the app: the release is bulk Parquet (about 12 GB for the world), read
here with DuckDB over HTTPS so only the rows asked for are downloaded.

For each country in prospects/overture-places.json it keeps named places that are open, state a phone or a website,
are in an allowed category, are not named after an individual (Dr., Adv., Mr. and the like) and come only from sources
under the allowed licences, up to the row budget (each group
its share, places with their own website first, then by Overture's confidence; chain branches are left out and one
organisation's branches count at most twice). It then delivers them to the app in batches
(/api/cron/gateway-ingest), which maps and checks them like any source's records. Businesses and organisations only:
a place is a named business listing, never a person's profile.

Env: SITE (e.g. https://works.wonderapps.biz), CRON_SECRET.
Options: --out FILE writes the rows as JSON lines and delivers nothing; --country IN; --release 2026-10-21.0;
         --row-cap N overrides the config's budget; --dry-run counts only.
Needs: pip install duckdb
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import duckdb

HERE = Path(__file__).resolve().parent
BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com"
UA = "WorksLakeGateway/1.0 (WonderWorks Overture Maps collection; +https://works.wonderapps.biz)"
BATCH = 1500

# ISO 3166-2:IN codes, as Overture's addresses often give a state. A two-letter value would otherwise read as a country.
IN_STATES = {
    "AN": "Andaman and Nicobar Islands", "AP": "Andhra Pradesh", "AR": "Arunachal Pradesh", "AS": "Assam", "BR": "Bihar",
    "CH": "Chandigarh", "CG": "Chhattisgarh", "CT": "Chhattisgarh", "DH": "Dadra and Nagar Haveli and Daman and Diu",
    "DL": "Delhi", "GA": "Goa", "GJ": "Gujarat", "HP": "Himachal Pradesh", "HR": "Haryana", "JH": "Jharkhand",
    "JK": "Jammu and Kashmir", "KA": "Karnataka", "KL": "Kerala", "LA": "Ladakh", "LD": "Lakshadweep", "MH": "Maharashtra",
    "ML": "Meghalaya", "MN": "Manipur", "MP": "Madhya Pradesh", "MZ": "Mizoram", "NL": "Nagaland", "OD": "Odisha",
    "OR": "Odisha", "PB": "Punjab", "PY": "Puducherry", "RJ": "Rajasthan", "SK": "Sikkim", "TG": "Telangana",
    "TS": "Telangana", "TN": "Tamil Nadu", "TR": "Tripura", "UK": "Uttarakhand", "UT": "Uttarakhand", "UP": "Uttar Pradesh",
    "WB": "West Bengal",
}
STATES = {"IN": IN_STATES}


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"user-agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode()


def latest_release():
    xml = get(f"{BUCKET}/?list-type=2&prefix=release/&delimiter=/")
    found = sorted(re.findall(r"<Prefix>release/([0-9.\-]+)/</Prefix>", xml))
    if not found:
        raise SystemExit("No Overture release is listed")
    return found[-1]


def place_files(release):
    xml = get(f"{BUCKET}/?list-type=2&prefix=release/{release}/theme=places/type=place/")
    keys = re.findall(r"<Key>([^<]+\.parquet)</Key>", xml)
    if not keys:
        raise SystemExit(f"Release {release} has no places files")
    return [f"{BUCKET}/{k}" for k in keys]


# A website's registrable domain, near enough: its last two labels, or three under a two-part suffix (shop.co.in).
SITE_SQL = r"""regexp_extract(regexp_extract(lower(websites[1]), '^(?:https?://)?([^/:?#]+)', 1), '([^.]+\.(?:(?:co|com|net|org|gov|ac|edu|gen|ind|firm)\.[a-z]{2}|[a-z]+))$', 1)"""


def sql_list(values):
    return "(" + ",".join("'" + str(v).replace("'", "''") + "'" for v in values) + ")" if values else "('')"


def region_name(country, value):
    v = (value or "").strip()
    if not v:
        return None
    code = v.upper().split("-")[-1]
    if len(code) == 2 and code in STATES.get(country, {}):
        return STATES[country][code]
    if len(v) <= 3:
        return None
    return v.title() if v.isupper() else v


ROLE_MAILBOXES = {
    "info", "contact", "contactus", "sales", "support", "hello", "enquiry", "enquiries", "inquiry", "admin", "office", "service", "services", "care",
    "customercare", "customerservice", "mail", "email", "team", "hr", "accounts", "booking", "bookings", "orders", "order", "marketing", "business",
    "help", "helpdesk", "feedback", "reception", "frontdesk", "admissions", "admission", "principal", "connect", "reach", "web", "online", "india", "corporate",
}


def business_mailbox(email, name, website):
    """
    The email only when it reads as the organisation's own mailbox: a role address (info@, sales@), or one named like
    the business or its site. A mailbox named after a person is not kept, so no named person's address is stored.
    """
    e = (email or "").strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[a-z]{2,}", e):
        return None
    local = re.sub(r"[^a-z0-9]", "", e.split("@")[0])
    if not local:
        return None
    if local in ROLE_MAILBOXES or any(local.startswith(r) or local.endswith(r) for r in ("info", "sales", "support", "contact", "enquiry", "care", "admin", "office")):
        return e
    words = [w for w in re.findall(r"[a-z0-9]{4,}", (name or "").lower())]
    host = re.sub(r"^(https?://)?(www\.)?", "", (website or "").lower()).split("/")[0].split(".")[0]
    squeezed = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    if any(w in local for w in words) or (len(host) >= 4 and (host in local or local in host)) or (len(local) >= 5 and local in squeezed):
        return e
    return None


def clean(value, limit):
    v = re.sub(r"\s+", " ", str(value or "")).strip()
    return v[:limit] if v else None


def collect(con, files, country, bbox, cfg, row_cap):
    """The country's eligible places, each in the first group that takes its category, cut to the budget."""
    groups = cfg["groups"]
    licences = sql_list(cfg["licences"])
    cases = " ".join(
        f"WHEN basic_category IN {sql_list(g['basic'])} OR taxonomy.primary IN {sql_list(g.get('taxonomy', []))} THEN '{g['id']}'" for g in groups
    )
    caps = " ".join(f"WHEN '{g['id']}' THEN {int(row_cap * g['share'])}" for g in groups)
    file_list = "[" + ",".join(f"'{f}'" for f in files) + "]"
    xmin, ymin, xmax, ymax = bbox
    # A branch of a known chain (a brand with a Wikidata entry) is not a business of its own.
    chains = "AND (brand IS NULL OR brand.wikidata IS NULL)" if cfg.get("skipChains", True) else ""
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE eligible AS
        SELECT id, names.primary AS name, confidence, basic_category, taxonomy.primary AS tax,
               websites[1] AS website, phones[1] AS phone, emails[1] AS email,
               addresses[1].freeform AS address, addresses[1].locality AS city, addresses[1].region AS region, addresses[1].postcode AS postcode,
               (bbox.xmin + bbox.xmax) / 2 AS lon, (bbox.ymin + bbox.ymax) / 2 AS lat,
               list_distinct(list_transform(sources, lambda s: s.dataset)) AS providers,
               {SITE_SQL} AS site,
               lower(trim(split_part(names.primary, ' - ', 1))) AS name_key,
               CASE {cases} END AS grp
        FROM read_parquet({file_list})
        WHERE bbox.xmin BETWEEN {xmin} AND {xmax} AND bbox.ymin BETWEEN {ymin} AND {ymax}
          AND addresses[1].country = '{country}'
          AND names.primary IS NOT NULL AND length(trim(names.primary)) >= 3
          -- Organisations only: a listing named after an individual (a practitioner's own page) is left out.
          AND NOT regexp_matches(lower(trim(names.primary)), '^(dr|prof|adv|advocate|mr|mrs|ms|miss|shri|smt|ca|er|col|capt)[. ]')
          AND confidence >= {float(cfg['minConfidence'])}
          AND (operating_status IS NULL OR operating_status = 'open')
          AND (len(phones) > 0 OR len(websites) > 0)
          AND len(list_filter(sources, lambda s: s.license IS NULL OR s.license NOT IN {licences})) = 0
          AND (CASE {cases} END) IS NOT NULL
          {chains}
        """
    )
    # A website on a shared host (a social page, a directory listing) is not the business's own site: such a row
    # ranks with those that have none, and many businesses may share the host.
    own = f"(site IS NOT NULL AND site <> '' AND site NOT IN {sql_list(cfg.get('sharedHosts', []))})"
    per = int(cfg.get("perOrganisation", 2))
    counts = dict(con.execute("SELECT grp, count(*) FROM eligible GROUP BY 1").fetchall())
    rows = con.execute(
        f"""
        SELECT * EXCLUDE (rn, per_site, per_name, own_site, site, name_key) FROM (
          SELECT *, row_number() OVER (PARTITION BY grp ORDER BY own_site DESC, confidence DESC, id) AS rn FROM (
            -- One organisation's branches share its site and its name: at most `perOrganisation` rows of each in a group.
            SELECT *, {own} AS own_site,
                   row_number() OVER (PARTITION BY grp, CASE WHEN {own} THEN site ELSE id END ORDER BY confidence DESC, id) AS per_site,
                   row_number() OVER (PARTITION BY grp, name_key ORDER BY confidence DESC, id) AS per_name
            FROM eligible
          ) WHERE per_site <= {per} AND per_name <= {per}
        ) WHERE rn <= CASE grp {caps} ELSE 0 END
        ORDER BY grp, rn
        """
    ).fetchall()
    cols = [d[0] for d in con.description]
    return [dict(zip(cols, r)) for r in rows], counts


def item(country, r):
    """One place as the record the source's mapping reads (sources/overture-places-<country>.json)."""
    tags = [t for t in [r["tax"], r["basic_category"], r["grp"]] if t]
    words = " ".join(dict.fromkeys(t.replace("_", " ") for t in tags[:2]))
    lat, lon = round(float(r["lat"]), 5), round(float(r["lon"]), 5)
    out = {
        "id": r["id"],
        "name": clean(r["name"], 200),
        "url": f"https://explore.overturemaps.org/#17/{lat}/{lon}",
        "categories": ";".join(dict.fromkeys(tags)),
        "words": words,
        "website": clean(r["website"], 300),
        "phone": clean(r["phone"], 40),
        "email": business_mailbox(r["email"], r["name"], r["website"]),
        "address": clean(r["address"], 200),
        "city": clean(r["city"], 80),
        "region": region_name(country, r["region"]),
        "postcode": clean(r["postcode"], 12),
        "lat": lat,
        "lon": lon,
        "confidence": round(float(r["confidence"]), 2),
        "providers": ";".join(sorted(p for p in (r["providers"] or []) if p)),
    }
    return {k: v for k, v in out.items() if v is not None}


def deliver(site, secret, url, items, merge, observed_at):
    body = json.dumps({"url": url, "items": items, "merge": merge, "observedAt": observed_at}).encode()
    req = urllib.request.Request(
        f"{site.rstrip('/')}/api/cron/gateway-ingest", data=body, method="POST",
        headers={"authorization": f"Bearer {secret}", "content-type": "application/json", "user-agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, json.loads(res.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except ValueError:
            return e.code, {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(HERE.parent / "prospects" / "overture-places.json"))
    ap.add_argument("--country")
    ap.add_argument("--release")
    ap.add_argument("--row-cap", type=int)
    ap.add_argument("--out")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text())
    release = args.release or (latest_release() if cfg.get("release", "latest") == "latest" else cfg["release"])
    files = place_files(release)
    row_cap = args.row_cap or int(cfg["rowCap"])
    site, secret = os.environ.get("SITE"), os.environ.get("CRON_SECRET")
    if not args.out and not args.dry_run and not (site and secret):
        print("::warning::SITE and CRON_SECRET are needed to deliver; use --out or --dry-run to only read")
        return 0

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET http_timeout=300000; SET enable_progress_bar=false;")
    failed = 0
    out = open(args.out, "w", encoding="utf-8") if args.out else None
    for country, c in cfg["countries"].items():
        if args.country and args.country != country:
            continue
        started = time.time()
        observed_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        rows, counts = collect(con, files, country, c["bbox"], cfg, row_cap)
        kept = {}
        for r in rows:
            kept[r["grp"]] = kept.get(r["grp"], 0) + 1
        eligible = sum(counts.values())
        print(f"{country}: release {release}, {eligible} eligible places, {len(rows)} kept, {eligible - len(rows)} dropped by the row budget of {row_cap} ({round(time.time() - started)} s)")
        for g in cfg["groups"]:
            print(f"  {g['id']}: {kept.get(g['id'], 0)} of {counts.get(g['id'], 0)}")
        items = [item(country, r) for r in rows]
        if out:
            for it in items:
                out.write(json.dumps(it, ensure_ascii=False) + "\n")
            continue
        if args.dry_run or not items:
            continue
        url = json.loads((HERE.parent / "sources" / f"overture-places-{country.lower()}.json").read_text())["url"]
        stored = 0
        for start in range(0, len(items), BATCH):
            batch = items[start:start + BATCH]
            last = start + BATCH >= len(items)
            status, body = deliver(site, secret, url, batch, not last, observed_at)
            ok = status == 200 and body.get("ok") is True
            if not ok:
                failed += 1
                print(f"::error::{country}: batch at row {start} was refused ({status} {json.dumps(body.get('error') or body.get('results') or '')[:300]}); stopping, the source keeps what it holds")
                break
            stored += len(batch)
            time.sleep(1)
        print(f"{country}: delivered {stored} of {len(items)} places")
    if out:
        out.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
