/**
 * The invoice summary (WJ-590): the quote both sides agreed, as a plain page that prints or saves as a PDF from the browser.
 * It carries only what the pro stated — their GSTIN, the GST rate and SAC, the TDS section and rate — and the arithmetic
 * on those. It is not a GST tax invoice: that is the pro's own, with the serial number, addresses and place of supply
 * the CGST Rules (rule 46) ask for. Every value is escaped; nothing the client or pro typed is ever markup.
 */
import { escapeHtml as h } from "../email/layout";
import { amountLabel, breakdown, paidLabel, startLabel, STATUS_LABEL, warrantyUntil } from "@/modules/services/deal";
import { shortDate } from "@/wonderworks/listing/terms";
import type { InvoiceData } from "./requests";

const day = (iso: string) => shortDate(iso.slice(0, 10));

export function renderInvoice(i: InvoiceData, side: "client" | "pro"): string {
  const q = i.deal.quote!;
  const cur = q.currency;
  const rows = breakdown(q)
    .map((r) => `<tr class="${r.strong ? "strong" : ""}"><td>${h(r.label)}${r.note ? ` <span class="note">${h(r.note)}</span>` : ""}</td><td class="amt">${r.minus ? "− " : ""}${h(amountLabel(r.amount, cur))}</td></tr>`)
    .join("");
  const paid = paidLabel(i.deal, side);
  const until = warrantyUntil(i.deal.doneAt, i.warrantyDays);
  const meta: [string, string][] = [
    ["Reference", i.ref],
    ["Service", i.title],
    ["Status", STATUS_LABEL[i.status]],
    ...(i.deal.booking ? ([["Booked", day(i.deal.booking.at)]] as [string, string][]) : []),
    ["Work", startLabel(q)],
    ...(i.deal.doneAt ? ([["Marked done", day(i.deal.doneAt)]] as [string, string][]) : []),
    ...(i.deal.paid?.client ? ([["Client marked paid", day(i.deal.paid.client)]] as [string, string][]) : []),
    ...(i.deal.paid?.pro ? ([["Pro marked paid", day(i.deal.paid.pro)]] as [string, string][]) : []),
    ...(until ? ([["Warranty", `${i.warrantyDays} days, until ${shortDate(until)}`]] as [string, string][]) : i.warrantyDays ? ([["Warranty", `${i.warrantyDays} days from the day it's done`]] as [string, string][]) : []),
  ];
  const party = (title: string, lines: (string | undefined)[]) => `<div><h2>${h(title)}</h2>${lines.filter(Boolean).map((l) => `<p>${h(l!)}</p>`).join("")}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Invoice summary ${h(i.ref)}</title><style>
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1c1a2e;margin:0;background:#f6f5fb}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}
.sheet{background:#fff;border:1px solid #e4e1f2;border-radius:16px;padding:24px}
h1{font-size:20px;margin:0 0 2px}h2{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b6788;margin:0 0 4px}
.sub{color:#6b6788;font-size:13px;margin:0 0 20px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}.parties p{margin:0}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:0 0 20px;font-size:14px}dt{color:#6b6788}dd{margin:0}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 0;border-bottom:1px solid #eeecf7}.amt{text-align:right;white-space:nowrap}.strong td{font-weight:700}.note{color:#6b6788;font-size:12px;font-weight:400}
.paid{margin:16px 0 0;font-weight:600}.fine{color:#6b6788;font-size:12px;margin:20px 0 0}
button{margin:0 0 16px;font:inherit;padding:10px 16px;border-radius:999px;border:0;background:#6d4cf5;color:#fff;cursor:pointer}
@media print{body{background:#fff}main{padding:0}.sheet{border:0;padding:0}button{display:none}}
</style></head><body><main><button onclick="window.print()">Print or save as PDF</button><div class="sheet">
<h1>Invoice summary</h1><p class="sub">${h(i.title)} · ${h(i.ref)}</p>
<div class="parties">${party("From", [i.pro.name, i.pro.gstin ? `GSTIN ${i.pro.gstin} (as the pro states it)` : undefined])}${party("To", [i.client.name, i.client.email])}</div>
<dl>${meta.map(([k, v]) => `<dt>${h(k)}</dt><dd>${h(v)}</dd>`).join("")}${i.deal.booking?.address ? `<dt>Place of work</dt><dd>${h(i.deal.booking.address)}</dd>` : ""}${q.note ? `<dt>Note</dt><dd>${h(q.note)}</dd>` : ""}</dl>
<table>${rows}</table>
${paid ? `<p class="paid">${h(paid)}</p>` : ""}
<p class="fine">This is a summary of the quote ${h(i.client.name.split(" ")[0] ?? "the client")} accepted${i.deal.booking ? ` on ${h(day(i.deal.booking.at))}` : ""}, prepared by WonderWorks from what the pro stated. It is not a GST tax invoice: a GST-registered pro issues their own, with the details the CGST Rules ask for. WonderWorks holds no money and checks no payment; paid is each side's own mark. ${q.tds ? `TDS is worked on the amount before GST, as the Income Tax Department's guidance has it when GST is shown separately; whether it applies to this payment is for the pro and the client to confirm, with a chartered accountant if unsure. ` : ""}</p>
</div></main></body></html>`;
}
