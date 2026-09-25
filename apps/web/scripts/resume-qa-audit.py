#!/usr/bin/env python3
"""Reads the harness PDFs back with PyMuPDF (pip install pymupdf) and reports what a reader would notice:
text overlapping text, text near the page edge, fonts not embedded, "?" replacement glyphs, and any
experience fact missing from the extracted text. Usage: python3 scripts/resume-qa-audit.py <RESUME_QA_OUT>"""
import pymupdf, json, sys, glob, os, re
Q=sys.argv[1]
tpl_margin={}
problems={}
for pdfp in sorted(glob.glob(f"{Q}/*/*.pdf")):
    fx,t=pdfp.split("/")[-2],os.path.basename(pdfp)[:-4]
    doc=pymupdf.open(pdfp)
    layout=json.load(open(pdfp[:-4]+".layout.json"))
    iss=[]
    # fonts embedded
    for pno,page in enumerate(doc):
        for f in page.get_fonts(full=True):
            if f[1] in ("n/a",) or not f[3]: iss.append(f"p{pno+1} font not embedded {f}")
        W,H=page.rect.width,page.rect.height
        spans=[]
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines",[]):
                for s in l["spans"]:
                    if s["text"].strip(): spans.append(s)
        for s in spans:
            x0,y0,x1,y1=s["bbox"]
            if x0<30 or x1>W-30 or y0<20 or y1>H-20: iss.append(f"p{pno+1} near edge: {s['text'][:40]!r} {tuple(round(v) for v in s['bbox'])}")
            if "?" in s["text"] and "?" not in json.dumps(json.load(open(f"{Q}/{fx}/document.json")),ensure_ascii=False): iss.append(f"p{pno+1} '?' glyph: {s['text'][:50]!r}")
        # overlap between spans (glyph boxes shrunk vertically to cap height)
        boxes=[(s,s["bbox"][0],s["bbox"][2],s["origin"][1]-s["size"]*0.7,s["origin"][1]+s["size"]*0.18) for s in spans]
        for i in range(len(boxes)):
            for j in range(i+1,len(boxes)):
                a,b=boxes[i],boxes[j]
                ox=min(a[2],b[2])-max(a[1],b[1]); oy=min(a[4],b[4])-max(a[3],b[3])
                if ox>0.8 and oy>0.8: iss.append(f"p{pno+1} overlap {a[0]['text'][:25]!r} / {b[0]['text'][:25]!r}")
        # rendered width vs layout width (font metrics mismatch): compare span widths with layout items per line
    # text fidelity: every fact word present in extracted text
    text=" ".join(p.get_text() for p in doc)
    norm=lambda s: re.sub(r"\s+"," ",s)
    d=json.load(open(f"{Q}/{fx}/document.json"))
    facts=[d["header"]["name"]]
    for s in d["sections"]:
        if s["type"]=="experience":
            for e in s["items"]: facts+= [e["employer"], e["title"]] + [b["text"] for b in e["bullets"]]
    flat=norm(text).replace("­","")
    for f in facts:
        # compare word-by-word ignoring line breaks
        w=[x for x in re.split(r"\s+",f) if x]
        if not all(x in flat or x.upper() in flat for x in w): iss.append(f"missing text: {f[:60]!r}")
    if iss: problems[f"{fx}/{t}"]=iss
for k,v in problems.items():
    print(k); [print("   ",x) for x in v[:12]]; 
    if len(v)>12: print("    ...",len(v)-12,"more")
print("files with issues:",len(problems))
