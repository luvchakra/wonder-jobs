#!/usr/bin/env python3
"""
Per-employer totals from a US Department of Labor LCA disclosure file (OFLC, quarterly, cumulative within a fiscal
year): certified H-1B applications only, with the median offered annual wage. Prints JSON for /api/cron/h1b.

  python3 aggregate.py LCA_Disclosure_Data_FY2026_Q3.xlsx > h1b.json
"""
import json, re, statistics, sys
import openpyxl

ANNUAL = {"year": 1, "month": 12, "bi-weekly": 26, "week": 52, "hour": 2080}

def annual(rate, unit):
    try:
        v = float(str(rate).replace("$", "").replace(",", ""))
    except (TypeError, ValueError):
        return None
    m = ANNUAL.get(str(unit or "").strip().lower())
    w = v * m if m else None
    # Outside any plausible annual wage: a typo in the filing, not a wage.
    return round(w) if w and 15_000 <= w <= 2_000_000 else None

def main(path):
    m = re.search(r"FY(\d{4})_Q(\d)", path)
    if not m:
        sys.exit("file name must contain FY<year>_Q<n>")
    wb = openpyxl.load_workbook(path, read_only=True)
    rows = wb[wb.sheetnames[0]].iter_rows(values_only=True)
    col = {h: i for i, h in enumerate(next(rows))}
    by = {}
    for r in rows:
        if r[col["CASE_STATUS"]] != "Certified" or r[col["VISA_CLASS"]] != "H-1B":
            continue
        name = re.sub(r"\s+", " ", str(r[col["EMPLOYER_NAME"]] or "")).strip()
        if not name:
            continue
        e = by.setdefault(name.upper(), {"name": name, "filings": 0, "wages": []})
        e["filings"] += 1
        w = annual(r[col["WAGE_RATE_OF_PAY_FROM"]], r[col["WAGE_UNIT_OF_PAY"]])
        if w:
            e["wages"].append(w)
    employers = [{"name": e["name"], "filings": e["filings"], **({"medianWage": round(statistics.median(e["wages"]))} if e["wages"] else {})} for e in by.values()]
    json.dump({"fiscalYear": int(m.group(1)), "through": f"FY{m.group(1)} Q{m.group(2)}", "employers": employers}, sys.stdout, separators=(",", ":"))

if __name__ == "__main__":
    main(sys.argv[1])
