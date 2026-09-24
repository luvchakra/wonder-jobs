"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Cloud, Code2, FileText, Globe, Plug, Rss, ScanSearch } from "lucide-react";
import type { Detection } from "@/domain/jobslake/detect";
import type { ResponseMapping } from "@/domain/jobslake/mapping";
import type { SourceConfig, TestReport } from "@/server/jobslake/types";
import type { SourceView } from "@/server/jobslake/views";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, Input, Select } from "@/components/common/Input";
import { MappingEditor, TestReportView } from "@/components/jobslake/SourceParts";
import { AccessBadge, adminFetch, Note, PageTitle, Panel, num } from "@/components/jobslake/ui";
import { cn } from "@/lib/cn";

type Kind = "ats_board" | "json_api" | "mcp" | "feed" | "structured" | "scraper";
type Step = "type" | "configure" | "mapping" | "test" | "activate";

const KINDS: { kind: Kind; title: string; body: string; icon: typeof Cloud; tags: string[] }[] = [
  { kind: "ats_board", title: "Career site / ATS", body: "A company board on Greenhouse, Lever, Ashby, SmartRecruiters or Workable.", icon: Globe, tags: ["Employer data", "No key needed"] },
  { kind: "json_api", title: "Official API", body: "A documented jobs API. You map its response to JobsLake fields.", icon: Cloud, tags: ["Most reliable"] },
  { kind: "mcp", title: "MCP", body: "A tool on an MCP server you're authorized to use.", icon: Plug, tags: ["AI-friendly"] },
  { kind: "feed", title: "Feed", body: "An RSS or Atom jobs feed.", icon: Rss, tags: ["Simple"] },
  { kind: "structured", title: "Structured page", body: "A careers page with schema.org JobPosting data.", icon: FileText, tags: ["Public data"] },
  { kind: "scraper", title: "Permitted scraper", body: "Recorded for governance only — no scraper engine runs here.", icon: Code2, tags: ["Needs written permission"] },
];

const POPULAR: { label: string; url?: string; note: string }[] = [
  { label: "Greenhouse", url: "https://boards.greenhouse.io/", note: "API" },
  { label: "Lever", url: "https://jobs.lever.co/", note: "API" },
  { label: "Ashby", url: "https://jobs.ashbyhq.com/", note: "API" },
  { label: "Workable", url: "https://apply.workable.com/", note: "API" },
  { label: "SmartRecruiters", url: "https://jobs.smartrecruiters.com/", note: "API" },
  { label: "LinkedIn", url: "https://www.linkedin.com/jobs", note: "Partner" },
  { label: "Indeed", url: "https://www.indeed.com", note: "Partner" },
  { label: "Naukri", url: "https://www.naukri.com", note: "Partner" },
  { label: "foundit", url: "https://www.foundit.in", note: "Partner" },
];

const STEPS: { key: Step; label: string }[] = [
  { key: "type", label: "Choose type" },
  { key: "configure", label: "Configure" },
  { key: "mapping", label: "Map response" },
  { key: "test", label: "Test & validate" },
  { key: "activate", label: "Activate" },
];

const EMPTY_MAPPING: ResponseMapping = { itemsPath: "", fields: {} };

export default function AddSourcePage() {
  const [step, setStep] = useState<Step>("type");
  const [kind, setKind] = useState<Kind>("ats_board");
  const [url, setUrl] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceView | null>(null);
  const [report, setReport] = useState<TestReport | null>(null);
  const [activated, setActivated] = useState(false);
  const router = useRouter();
  const needsMapping = kind === "json_api" || kind === "mcp";
  const steps = STEPS.filter((s) => s.key !== "mapping" || needsMapping);
  const at = steps.findIndex((s) => s.key === step);

  const runDetect = async () => {
    setBusy(true);
    setError(null);
    const r = await adminFetch<Detection>("detect", { method: "POST", body: JSON.stringify({ url }) });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setDetection(r.data);
    if (r.data.kind === "ats_board") setKind("ats_board");
    else if (r.data.kind === "custom" && kind === "ats_board") setKind("json_api");
  };

  const runTest = async (id: string) => {
    setBusy(true);
    setError(null);
    const r = await adminFetch<TestReport>(`sources/${id}/test`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setReport(r.data);
  };

  return (
    <>
      <PageTitle title="Add a job source" subtitle="A source serves candidates only after a real, validated connection — detection alone never activates anything." />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card padding="sm" className="h-fit">
          <ol className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.key} aria-current={s.key === step ? "step" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px]", s.key === step ? "bg-brand-50 font-medium text-brand-700" : i < at ? "text-ink-2" : "text-ink-4")}>
                <span className={cn("grid size-6 place-items-center rounded-full text-[11px]", i < at ? "bg-success-100 text-success-600" : s.key === step ? "bg-brand-500 text-white" : "bg-bg-soft")}>{i < at ? <CheckCircle2 className="size-3.5" aria-hidden /> : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {error && <Note tone="danger">{error}</Note>}

          {step === "type" && (
            <>
              <Panel title="What are you connecting?">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Integration type">
                  {KINDS.map(({ kind: k, title, body, icon: Icon, tags }) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("flex flex-col gap-1.5 rounded-[14px] border p-3 text-left transition-colors", kind === k ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-100" : "border-line hover:border-line-strong")}>
                      <Icon className="size-5 text-brand-600" aria-hidden />
                      <span className="text-[14px] font-medium text-ink">{title}</span>
                      <span className="text-[12px] text-ink-3">{body}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span key={t} className="rounded-full bg-bg-soft px-2 py-0.5 text-[11px] text-ink-3">
                            {t}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>
              <Panel title="Careers or job-listing URL">
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runDetect();
                  }}
                >
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jobs.lever.co/company" aria-label="Careers or job-listing URL" className="font-mono text-[13px]" />
                  <Button type="submit" loading={busy} disabled={!url.trim()} icon={<ScanSearch className="size-4" aria-hidden />}>
                    Detect
                  </Button>
                </form>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-ink-4">Popular:</span>
                  {POPULAR.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setUrl(p.url ?? "");
                        setDetection(null);
                      }}
                      className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-line-strong"
                    >
                      {p.label} <span className="text-ink-4">· {p.note}</span>
                    </button>
                  ))}
                </div>
                {detection && <DetectionCard d={detection} onContinue={() => setStep("configure")} />}
                {!detection && kind !== "ats_board" && (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => setStep("configure")}>
                      Skip detection and configure manually
                    </Button>
                  </div>
                )}
              </Panel>
            </>
          )}

          {step === "configure" && (
            <ConfigureStep
              kind={kind}
              url={url}
              detection={detection}
              onBack={() => setStep("type")}
              onCreated={(s) => {
                // A source that can't be activated (a scraper) has nothing to test: show it as registered.
                if (s.status === "do_not_use") return router.push(`/platform/jobs-lake/sources/${s.id}`);
                setSource(s);
                setStep(needsMapping ? "mapping" : "test");
              }}
            />
          )}

          {step === "mapping" && source && (
            <Panel title="Map the response to JobsLake fields">
              <MappingEditor
                sourceId={source.id}
                initial={EMPTY_MAPPING}
                onSave={async (mapping) => {
                  const cfg = source.config;
                  const next = cfg.kind === "json_api" ? { ...cfg, api: { ...cfg.api, mapping } } : cfg.kind === "mcp" ? { ...cfg, mcp: { ...cfg.mcp, mapping } } : cfg;
                  const r = await adminFetch<{ source: SourceView }>(`sources/${source.id}`, { method: "PATCH", body: JSON.stringify({ config: next }) });
                  if (!r.ok) return r.error.message;
                  setSource(r.data.source);
                  return null;
                }}
              />
              <div className="mt-4 flex justify-end">
                <Button onClick={() => setStep("test")}>Continue to test</Button>
              </div>
            </Panel>
          )}

          {step === "test" && source && (
            <Panel
              title="Test & validate"
              action={
                <Button size="sm" onClick={() => runTest(source.id)} loading={busy}>
                  {report ? "Test again" : "Run test"}
                </Button>
              }
            >
              {report ? <TestReportView report={report} /> : <p className="text-[13px] text-ink-3">The test fetches from {source.name} through its real connector and validates every record against Protocol v1. Nothing is shown to candidates.</p>}
              <div className="mt-4 flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(needsMapping ? "mapping" : "configure")} disabled={needsMapping ? false : true}>
                  Back
                </Button>
                <Button onClick={() => setStep("activate")} disabled={!report?.ok}>
                  Continue
                </Button>
              </div>
            </Panel>
          )}

          {step === "activate" && source && report && (
            <Panel title={activated ? "Source activated" : "Ready to activate"}>
              {activated ? (
                <div className="flex flex-col items-start gap-3">
                  <Note tone="success">{source.name} is active. JobsLake includes it in searches from now on, and its health is measured from the runs it records.</Note>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" href={`/platform/jobs-lake/sources/${source.id}`}>
                      View source
                    </Button>
                    <Button size="sm" variant="outline" href="/platform/jobs-lake/playground">
                      Try it in the playground
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Jobs discovered", report.discovered],
                      ["Valid records", report.valid],
                      ["Potential duplicates", report.duplicates],
                    ].map(([k, v]) => (
                      <div key={k as string} className="rounded-[12px] bg-bg-soft p-3">
                        <dt className="text-[11px] text-ink-3">{k}</dt>
                        <dd className="text-[20px] font-semibold tabular-nums text-ink">{num(v as number)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[13px] text-ink-3">From the test run {new Date(report.at).toLocaleTimeString()}. Activation needs a passing test from the last 24 hours.</p>
                  <div className="mt-4 flex justify-between gap-2">
                    <Button variant="ghost" onClick={() => setStep("test")}>
                      Back
                    </Button>
                    <Button
                      loading={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError(null);
                        const r = await adminFetch<{ source: SourceView }>(`sources/${source.id}/activate`, { method: "POST" });
                        setBusy(false);
                        if (!r.ok) return setError(r.error.message);
                        setSource(r.data.source);
                        setActivated(true);
                      }}
                    >
                      Activate source
                    </Button>
                  </div>
                </>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function DetectionCard({ d, onContinue }: { d: Detection; onContinue: () => void }) {
  if (d.kind === "ats_board")
    return (
      <div className="mt-4 rounded-[14px] border border-success-100 bg-success-100/40 p-3">
        <p className="text-[14px] font-medium text-ink">
          {d.provider} board detected <AccessBadge label="API" />
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          Board <span className="font-mono">{d.slug}</span> · official API · no credential needed · capabilities: {d.capabilities.join(", ")}
        </p>
        <Button size="sm" className="mt-3" onClick={onContinue}>
          Continue
        </Button>
      </div>
    );
  if (d.kind === "partnership" || d.kind === "invalid") return <div className="mt-4">{<Note tone={d.kind === "invalid" ? "danger" : "warning"}>{d.message}</Note>}</div>;
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <Note>{d.message}</Note>
      <Button size="sm" onClick={onContinue}>
        Configure as the type selected above
      </Button>
    </div>
  );
}

function ConfigureStep({ kind, url, detection, onBack, onCreated }: { kind: Kind; url: string; detection: Detection | null; onBack: () => void; onCreated: (s: SourceView) => void }) {
  const ats = detection?.kind === "ats_board" ? detection : null;
  const guessCompany = ats ? ats.slug.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
  const cleanUrl = url.trim() && !/^https?:\/\//i.test(url.trim()) ? `https://${url.trim()}` : url.trim();
  const [name, setName] = useState(ats ? `${guessCompany} careers` : "");
  const [company, setCompany] = useState(guessCompany);
  const [geo, setGeo] = useState("global");
  const [description, setDescription] = useState("");
  const [endpoint, setEndpoint] = useState(ats ? "" : cleanUrl);
  const [queryParam, setQueryParam] = useState("");
  const [locationParam, setLocationParam] = useState("");
  const [toolName, setToolName] = useState("search_jobs");
  const [credentialHeader, setCredentialHeader] = useState("");
  const [credentialPrefix, setCredentialPrefix] = useState("");
  const [credential, setCredential] = useState("");
  const [employer, setEmployer] = useState("");
  const [permission, setPermission] = useState<"granted_in_writing" | "terms_permit" | "not_established" | "denied">("not_established");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = (): SourceConfig | null => {
    switch (kind) {
      case "ats_board":
        return ats ? { kind: "ats_board", platform: ats.platform, slug: ats.slug, company } : null;
      case "json_api":
        return { kind: "json_api", api: { endpoint, queryParam: queryParam || undefined, locationParam: locationParam || undefined, credentialHeader: credentialHeader || undefined, credentialPrefix: credentialPrefix || undefined, mapping: EMPTY_MAPPING } };
      case "mcp":
        return { kind: "mcp", mcp: { endpoint, toolName, queryArgument: queryParam || "query", locationArgument: locationParam || undefined, credentialHeader: credentialHeader || undefined, credentialPrefix: credentialPrefix || undefined, mapping: EMPTY_MAPPING } };
      case "feed":
        return { kind: "feed", feed: { url: endpoint, defaultEmployer: employer || undefined } };
      case "structured":
        return { kind: "structured", page: { url: endpoint } };
      case "scraper":
        return { kind: "scraper", governance: { permission, termsReviewed: reviewed, robotsReviewed: reviewed, crawlDelaySec: 10, maxConcurrency: 1, failureThreshold: 3, retentionDays: 30, attribution: name, canonicalSourceUrl: endpoint } };
    }
  };

  if (kind === "ats_board" && !ats) return <Note tone="warning">Detect a career-site URL first — the board is identified from it.</Note>;

  return (
    <Panel title="Configure">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const cfg = config();
          if (!cfg) return;
          setBusy(true);
          setError(null);
          const r = await adminFetch<{ source: SourceView }>("sources", { method: "POST", body: JSON.stringify({ name, description, geography: geo.split(",").map((g) => g.trim()).filter(Boolean), config: cfg, credential: credential || undefined }) });
          setBusy(false);
          setCredential("");
          if (!r.ok) return setError(r.error.message);
          onCreated(r.data.source);
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name" required htmlFor="c-name">
            <Input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Geography" hint="Country codes, “remote” or “global”, comma-separated." htmlFor="c-geo">
            <Input id="c-geo" value={geo} onChange={(e) => setGeo(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="c-desc" className="md:col-span-2">
            <Input id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {kind === "ats_board" && ats && (
            <>
              <Field label="Company name" required hint="How jobs from this board are attributed." htmlFor="c-company">
                <Input id="c-company" required value={company} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <Field label="Board" htmlFor="c-board">
                <Input id="c-board" readOnly value={`${ats.provider} · ${ats.slug}`} className="font-mono text-[13px]" />
              </Field>
            </>
          )}
          {kind !== "ats_board" && (
            <Field label={kind === "mcp" ? "MCP endpoint (https)" : kind === "scraper" ? "Canonical source URL" : kind === "feed" ? "Feed URL (https)" : kind === "structured" ? "Page URL (https)" : "API endpoint (https)"} required htmlFor="c-endpoint" className="md:col-span-2" hint="Private, internal and non-https addresses are refused.">
              <Input id="c-endpoint" required value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="font-mono text-[13px]" />
            </Field>
          )}
          {(kind === "json_api" || kind === "mcp") && (
            <>
              {kind === "mcp" && (
                <Field label="Tool name" required htmlFor="c-tool">
                  <Input id="c-tool" required value={toolName} onChange={(e) => setToolName(e.target.value)} className="font-mono text-[13px]" />
                </Field>
              )}
              <Field label={kind === "mcp" ? "Search argument" : "Search parameter"} hint={kind === "mcp" ? "Defaults to “query”." : "e.g. q — leave empty to fetch all and match locally."} htmlFor="c-q">
                <Input id="c-q" value={queryParam} onChange={(e) => setQueryParam(e.target.value)} className="font-mono text-[13px]" />
              </Field>
              <Field label={kind === "mcp" ? "Location argument" : "Location parameter"} htmlFor="c-loc">
                <Input id="c-loc" value={locationParam} onChange={(e) => setLocationParam(e.target.value)} className="font-mono text-[13px]" />
              </Field>
              <Field label="Credential header" hint="e.g. Authorization or X-API-Key. Leave empty if the source is public." htmlFor="c-hdr">
                <Input id="c-hdr" value={credentialHeader} onChange={(e) => setCredentialHeader(e.target.value)} className="font-mono text-[13px]" />
              </Field>
              <Field label="Credential prefix" hint="e.g. “Bearer ”" htmlFor="c-pfx">
                <Input id="c-pfx" value={credentialPrefix} onChange={(e) => setCredentialPrefix(e.target.value)} className="font-mono text-[13px]" />
              </Field>
              {credentialHeader && (
                <Field label="Credential" hint="Encrypted on save and never displayed again." htmlFor="c-secret" className="md:col-span-2">
                  <Input id="c-secret" type="password" autoComplete="off" value={credential} onChange={(e) => setCredential(e.target.value)} />
                </Field>
              )}
            </>
          )}
          {kind === "feed" && (
            <Field label="Employer" hint="For a single company's feed." htmlFor="c-emp">
              <Input id="c-emp" value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </Field>
          )}
          {kind === "scraper" && (
            <>
              <Field label="Permission to collect" required htmlFor="c-perm">
                <Select id="c-perm" value={permission} onChange={(e) => setPermission(e.target.value as typeof permission)}>
                  <option value="not_established">Not established</option>
                  <option value="granted_in_writing">Granted in writing</option>
                  <option value="terms_permit">The site&apos;s terms permit it</option>
                  <option value="denied">Denied</option>
                </Select>
              </Field>
              <label className="flex items-center gap-2 self-end text-[13px] text-ink-2">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> Terms and robots.txt reviewed
              </label>
              <div className="md:col-span-2">
                <Note tone="warning">Scraped sources are recorded as “Do not use”: no scraper engine is enabled on this deployment, so JobsLake never collects from them.</Note>
              </div>
            </>
          )}
        </div>
        {error && <Note tone="danger">{error}</Note>}
        <div className="flex justify-between gap-2">
          <Button variant="ghost" type="button" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" loading={busy}>
            Save as draft
          </Button>
        </div>
      </form>
    </Panel>
  );
}
