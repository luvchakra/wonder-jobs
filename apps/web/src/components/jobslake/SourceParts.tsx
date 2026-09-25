"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { getPath, MAPPABLE_FIELDS, validateMapping, type MappableField, type MappingResult, type ResponseMapping } from "@/domain/jobslake/mapping";
import type { CredentialStatus } from "@/server/jobslake/credentials";
import type { PreviewResult } from "@/server/jobslake/admin";
import type { TestReport } from "@/server/jobslake/types";
import { formatDate, relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { adminFetch, ConfirmAction, Note, ms, num } from "./ui";

export function CheckList({ checks }: { checks: { label: string; ok: boolean; detail?: string }[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {checks.map((c) => (
        <li key={c.label} className="flex items-start gap-2 text-[13px]">
          {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" aria-label="Passed" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-600" aria-label="Failed" />}
          <span>
            <span className="text-ink">{c.label}</span>
            {c.detail && <span className="text-ink-3"> — {c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A test run, exactly as it happened: only the checks that ran, and the real counts. */
export function TestReportView({ report }: { report: TestReport }) {
  return (
    <div className="flex flex-col gap-3">
      <Note tone={report.ok ? "success" : "danger"}>
        {report.ok ? "Test passed" : `Test failed${report.error ? ` — ${report.error}` : ""}`} · {formatDate(report.at, { dateStyle: "medium", timeStyle: "short" })} · {ms(report.durationMs)}
      </Note>
      <CheckList checks={report.checks} />
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Jobs discovered", report.discovered],
          ["Valid records", report.valid],
          ["Potential duplicates", report.duplicates],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-[12px] bg-bg-soft p-2">
            <dt className="text-[11px] text-ink-3">{k}</dt>
            <dd className="text-[18px] font-semibold tabular-nums text-ink">{num(v as number)}</dd>
          </div>
        ))}
      </dl>
      {report.sampleTitles.length > 0 && (
        <div>
          <p className="mb-1 text-[12px] font-medium text-ink-2">Sample of what it returned</p>
          <ul className="list-disc pl-5 text-[12px] text-ink-3">
            {report.sampleTitles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Response mapping editor (spec §28). Previewing fetches the saved source with the proposed mapping
 * (nothing is stored); validation runs on what came back. Saving puts the source back to Draft,
 * because a changed mapping has to pass a test again before it serves candidates.
 */
export function MappingEditor({ sourceId, initial, onSave }: { sourceId: string; initial: ResponseMapping; onSave: (m: ResponseMapping) => Promise<string | null> }) {
  const [m, setM] = useState<ResponseMapping>(initial);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const setField = (f: MappableField, v: string) => setM((x) => ({ ...x, fields: { ...x.fields, [f]: v || undefined } }));
  const validation = useMemo(() => (preview?.mapping ? validateMapping(m, preview.mapping as MappingResult) : null), [m, preview]);

  const runPreview = async () => {
    setBusy("preview");
    setMsg(null);
    const r = await adminFetch<PreviewResult>(`sources/${sourceId}/preview`, { method: "POST", body: JSON.stringify({ mapping: m }) });
    setBusy(null);
    if (r.ok) setPreview(r.data);
    else setMsg({ tone: "danger", text: r.error.message });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="List of jobs is at" hint="Dot path to the array, e.g. jobs or data.results. Empty if the response is the list." htmlFor="map-items">
          <Input id="map-items" value={m.itemsPath} onChange={(e) => setM({ ...m, itemsPath: e.target.value })} className="font-mono text-[13px]" />
        </Field>
        <Field label="Employer when the source has none" hint="For a single company's feed." htmlFor="map-employer">
          <Input id="map-employer" value={m.defaultEmployer ?? ""} onChange={(e) => setM({ ...m, defaultEmployer: e.target.value || undefined })} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-4">
              <th className="px-2 py-2 font-medium">JobsLake field</th>
              <th className="px-2 py-2 font-medium">Source field</th>
              <th className="px-2 py-2 font-medium">Sample value</th>
              <th className="px-2 py-2 text-right font-medium">Filled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {MAPPABLE_FIELDS.map((f) => {
              const path = m.fields[f.field] ?? "";
              const sample = preview?.sample != null && path ? getPath(preview.sample, path) : undefined;
              const cov = preview?.mapping ? `${preview.mapping.coverage[f.field]}/${preview.mapping.totalItems}` : "—";
              return (
                <tr key={f.field}>
                  <td className="px-2 py-1.5 text-ink-2">
                    {f.label}
                    {f.required && <span className="text-danger-600"> *</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`Source field for ${f.label}`} value={path} onChange={(e) => setField(f.field, e.target.value)} className="h-9 font-mono text-[12px]" placeholder="e.g. title" />
                  </td>
                  <td className="max-w-[220px] truncate px-2 py-1.5 font-mono text-[11px] text-ink-3" title={sample === undefined ? "" : String(JSON.stringify(sample))}>
                    {sample === undefined ? "" : JSON.stringify(sample)?.slice(0, 80)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink-3">{cov}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={runPreview} loading={busy === "preview"} icon={<Eye className="size-3.5" aria-hidden />}>
          Preview with live data
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            setBusy("save");
            const err = await onSave(m);
            setBusy(null);
            setMsg(err ? { tone: "danger", text: err } : { tone: "success", text: "Mapping saved. The source is back in Draft until it passes a test." });
          }}
          loading={busy === "save"}
        >
          Save mapping
        </Button>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      {validation && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink">Validation</p>
          <CheckList checks={validation.checks} />
        </div>
      )}
      {preview?.sample != null && (
        <details className="rounded-[12px] border border-line p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">First item, as the source sent it</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-[10px] bg-[#15132b] p-3 text-[11px] leading-relaxed text-white/85">{JSON.stringify(preview.sample, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/** Write-only credential form: the secret is sent once and never shown again (spec §49). */
export function CredentialForm({ sourceId, credential, onChanged }: { sourceId: string; credential: CredentialStatus | null; onChanged: () => void }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  if (credential?.managedBy === "environment") {
    return (
      <Note tone={credential.present ? "success" : "warning"}>
        {credential.masked}. This credential lives in the deployment&apos;s environment variables; change it in the hosting platform.
      </Note>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">
        {credential?.present ? (
          <>
            Stored: <span className="font-mono">{credential.masked}</span>
            {credential.replacedAt ? ` · replaced ${relativeTime(credential.replacedAt)}` : credential.createdAt ? ` · added ${relativeTime(credential.createdAt)}` : ""}
          </>
        ) : (
          "No credential stored."
        )}
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await adminFetch(`sources/${sourceId}/credential`, { method: "PUT", body: JSON.stringify({ secret }) });
          setBusy(false);
          setSecret("");
          setMsg(r.ok ? { tone: "success", text: "Saved. It's encrypted and won't be shown again." } : { tone: "danger", text: r.error.message });
          if (r.ok) onChanged();
        }}
      >
        <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={credential?.present ? "Paste a replacement" : "Paste the API key or token"} aria-label="Credential" />
        <Button type="submit" size="md" loading={busy} disabled={secret.trim().length < 4}>
          {credential?.present ? "Replace" : "Save"}
        </Button>
      </form>
      {credential?.present && (
        <div>
          <ConfirmAction
            label="Remove credential"
            variant="outline"
            title="Remove this credential?"
            body={<p>The source will stop working until a new credential is saved. This can&apos;t be undone — the stored secret is deleted.</p>}
            confirmLabel="Remove credential"
            onConfirm={async () => {
              const r = await adminFetch(`sources/${sourceId}/credential`, { method: "DELETE" });
              if (!r.ok) return r.error.message;
              onChanged();
              return null;
            }}
          />
        </div>
      )}
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </div>
  );
}
