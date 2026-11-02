"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Cloud, Code2, FileText, Globe, Plug, Rss, ScanSearch, Upload } from "lucide-react";
import type { Detection } from "@/domain/jobslake/detect";
import type { ResponseMapping } from "@/domain/jobslake/mapping";
import { kindFitsModule, type SourceKind } from "@/domain/jobslake/sourceKinds";
import type { SourceConfig, TestReport } from "@/server/jobslake/types";
import type { SourceView } from "@/server/jobslake/views";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, Input, Select } from "@/components/common/Input";
import { MappingEditor, TestReportView } from "@/components/jobslake/SourceParts";
import { AccessBadge, adminFetch, Note, PageTitle, Panel, num } from "@/components/jobslake/ui";
import { MODULES, isModuleId, type ModuleId } from "@/modules/registry";
import { cn } from "@/lib/cn";

type Kind = SourceKind;
type Step = "type" | "configure" | "mapping" | "test" | "activate";

/** What WorksLake can connect today (2026-11-02), in plain words for every module. */
const KINDS: { kind: Kind; title: string; body: string; icon: typeof Cloud }[] = [
  { kind: "ats_board", title: "Careers site", body: "A company's board on Greenhouse, Lever, Ashby, SmartRecruiters or Workable. No key needed.", icon: Globe },
  { kind: "json_api", title: "API", body: "A documented listings API. You map its fields once.", icon: Cloud },
  { kind: "feed", title: "Feed", body: "An RSS or Atom feed of listings.", icon: Rss },
  { kind: "structured", title: "Page with job data", body: "A careers page publishing schema.org JobPosting.", icon: FileText },
  { kind: "mcp", title: "MCP tool", body: "A tool on an MCP server you're authorized to use. You map its fields once.", icon: Plug },
  { kind: "scraper", title: "Record a site only", body: "Kept on record with its permission; nothing is collected from it.", icon: Code2 },
];

const ATS_EXAMPLES: { label: string; url: string }[] = [
  { label: "Greenhouse", url: "https://boards.greenhouse.io/" },
  { label: "Lever", url: "https://jobs.lever.co/" },
  { label: "Ashby", url: "https://jobs.ashbyhq.com/" },
  { label: "Workable", url: "https://apply.workable.com/" },
  { label: "SmartRecruiters", url: "https://jobs.smartrecruiters.com/" },
];

const STEPS: { key: Step; label: string }[] = [
  { key: "type", label: "Source" },
  { key: "configure", label: "Details" },
  { key: "mapping", label: "Map fields" },
  { key: "test", label: "Test" },
  { key: "activate", label: "Go live" },
];

const EMPTY_MAPPING: ResponseMapping = { itemsPath: "", fields: {} };

export default function AddSourcePage() {
  return (
    <Suspense fallback={null}>
      <AddSource />
    </Suspense>
  );
}

function AddSource() {
  const param = useSearchParams().get("module");
  const [module, setModule] = useState<ModuleId>(isModuleId(param) ? param : "jobs");
  const [step, setStep] = useState<Step>("type");
  const [kind, setKind] = useState<Kind>(kindFitsModule("ats_board", isModuleId(param) ? param : "jobs") ? "ats_board" : "json_api");
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
  const moduleLabel = MODULES.find((m) => m.id === module)?.label ?? "Jobs";
  const kinds = KINDS.filter((k) => kindFitsModule(k.kind, module));
  const jobPostings = kindFitsModule("ats_board", module);

  const pickModule = (m: ModuleId) => {
    setModule(m);
    setDetection(null);
    if (!kindFitsModule(kind, m)) setKind("json_api");
  };

  const runDetect = async () => {
    setBusy(true);
    setError(null);
    const r = await adminFetch<Detection>("detect", { method: "POST", body: JSON.stringify({ url }) });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setDetection(r.data);
    if (r.data.kind === "ats_board" && jobPostings) setKind("ats_board");
    else if (r.data.kind === "custom" && (kind === "ats_board" || !kindFitsModule(kind, module))) setKind("json_api");
  };

  const runTest = async (id: string) => {
    setBusy(true);
    setError(null);
    const r = await adminFetch<TestReport>(`sources/${id}/test`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setReport(r.data);
  };

  const canContinue = kind === "ats_board" ? detection?.kind === "ats_board" : detection?.kind !== "invalid" && detection?.kind !== "partnership";

  return (
    <>
      <PageTitle title="Add a source" subtitle="Bring a site, API or feed into a module's Find. Nothing reaches Find until its test passes and you make it live." />
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <Card padding="sm" className="h-fit min-w-0">
          <p className="px-1 text-[12px] text-ink-3 lg:hidden">
            Step {at + 1} of {steps.length} · <span className="font-medium text-ink">{steps[at]?.label}</span>
            {step !== "type" && <> · {moduleLabel}</>}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-soft lg:hidden" aria-hidden>
            <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
          </div>
          <ol className="hidden flex-col gap-1 lg:flex" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.key} aria-current={s.key === step ? "step" : undefined} className={cn("flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px]", s.key === step ? "bg-brand-50 font-medium text-brand-700" : i < at ? "text-ink-2" : "text-ink-4")}>
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
              <Panel title="Which module?">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Module">
                  {MODULES.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={module === m.id} onClick={() => pickModule(m.id)} className={cn("rounded-full border px-3 py-1.5 text-[13px]", module === m.id ? "border-brand-400 bg-brand-50 font-medium text-brand-700" : "border-line text-ink-2 hover:border-line-strong")}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Where are the listings?">
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runDetect();
                  }}
                >
                  <Input value={url} onChange={(e) => { setUrl(e.target.value); setDetection(null); }} placeholder={jobPostings ? "https://jobs.lever.co/company" : "https://example.org/api/listings"} aria-label="Link to the listings" className="font-mono text-[13px]" />
                  <Button type="submit" variant="outline" loading={busy} disabled={!url.trim()} icon={<ScanSearch className="size-4" aria-hidden />}>
                    Check link
                  </Button>
                </form>
                {jobPostings && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-ink-4">Careers sites:</span>
                    {ATS_EXAMPLES.map((p) => (
                      <button key={p.label} type="button" onClick={() => { setUrl(p.url); setDetection(null); }} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-line-strong">
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                {detection && <DetectionCard d={detection} />}

                <p className="mt-4 text-[12px] font-medium text-ink-3">Kind of source</p>
                <div className="mt-1.5 flex flex-col gap-1.5" role="radiogroup" aria-label="Kind of source">
                  {kinds.map(({ kind: k, title, body, icon: Icon }) => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("flex items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left", kind === k ? "border-brand-400 bg-brand-50/60" : "border-line hover:border-line-strong")}>
                      <Icon className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-ink">{title}</span>
                        <span className="block text-[12px] text-ink-3">{body}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-[12px] text-ink-3">
                  <Upload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    A partner&apos;s list (CSV or JSON), or a reviewed catalogue source?{" "}
                    <Link href="/platform/jobs-lake/import" className="font-medium text-brand-600 hover:underline">
                      Data → Import
                    </Link>
                  </span>
                </p>
                <div className="mt-4 flex justify-end">
                  <Button onClick={() => setStep("configure")} disabled={!canContinue || (kind !== "scraper" && kind !== "ats_board" && !url.trim())}>
                    Continue
                  </Button>
                </div>
              </Panel>
            </>
          )}

          {step === "configure" && (
            <ConfigureStep
              module={module}
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
            <Panel title="Map its fields">
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
              title="Test"
              action={
                <Button size="sm" onClick={() => runTest(source.id)} loading={busy}>
                  {report ? "Test again" : "Run test"}
                </Button>
              }
            >
              {report ? <TestReportView report={report} /> : <p className="text-[13px] text-ink-3">The test fetches from {source.name} and checks every listing. Nobody sees anything from it yet.</p>}
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
            <Panel title={activated ? "Live" : "Ready to go live"}>
              {activated ? (
                <div className="flex flex-col items-start gap-3">
                  <Note tone="success">{source.name} is live in {moduleLabel}. Its listings reach Find from the next search or import, and its health shows on its page.</Note>
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
                      ["Listings found", report.discovered],
                      ["Valid", report.valid],
                      ["Possible duplicates", report.duplicates],
                    ].map(([k, v]) => (
                      <div key={k as string} className="rounded-[12px] bg-bg-soft p-3">
                        <dt className="text-[11px] text-ink-3">{k}</dt>
                        <dd className="text-[20px] font-semibold tabular-nums text-ink">{num(v as number)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[13px] text-ink-3">From the test run {new Date(report.at).toLocaleTimeString()}. Going live needs a passing test from the last 24 hours.</p>
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
                      Make it live
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

function DetectionCard({ d }: { d: Detection }) {
  if (d.kind === "ats_board")
    return (
      <div className="mt-4 rounded-[14px] border border-success-100 bg-success-100/40 p-3">
        <p className="text-[14px] font-medium text-ink">
          {d.provider} board detected <AccessBadge label="API" />
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          Board <span className="font-mono">{d.slug}</span> · official API · no credential needed · capabilities: {d.capabilities.join(", ")}
        </p>
      </div>
    );
  if (d.kind === "partnership" || d.kind === "invalid") return <div className="mt-4">{<Note tone={d.kind === "invalid" ? "danger" : "warning"}>{d.message}</Note>}</div>;
  return (
    <div className="mt-4">
      <Note>{d.message} Pick its kind below.</Note>
    </div>
  );
}

function ConfigureStep({ module, kind, url, detection, onBack, onCreated }: { module: ModuleId; kind: Kind; url: string; detection: Detection | null; onBack: () => void; onCreated: (s: SourceView) => void }) {
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
          const r = await adminFetch<{ source: SourceView }>("sources", { method: "POST", body: JSON.stringify({ module, name, description, geography: geo.split(",").map((g) => g.trim()).filter(Boolean), config: cfg, credential: credential || undefined }) });
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
                <Note tone="warning">Scraped sources are recorded as “Do not use”: no scraper engine is enabled on this deployment, so WorksLake never collects from them.</Note>
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
