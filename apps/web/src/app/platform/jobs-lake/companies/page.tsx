"use client";
import { useState } from "react";
import type { DirectoryCompany } from "@/server/jobslake/companies";
import { companyLines } from "@/domain/jobslake/companies";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/common/Button";
import { Chip, Input } from "@/components/common/Input";
import {
  adminFetch,
  LoadError,
  Loading,
  PageTitle,
  Panel,
  ResponsiveTable,
  num,
  useAdmin,
} from "@/components/jobslake/ui";

const PAGE = 50;
const LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/x-icon",
];

/**
 * A company's (or event poster's) logo and the three things an admin can do to it: fetch it again from its own site,
 * upload one (PNG, JPEG, GIF, WebP or ICO, under 256 KB; checked again on the server), or remove a wrong one.
 */
function LogoCell({
  c,
  onChanged,
}: {
  c: DirectoryCompany;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [v, setV] = useState(0);
  const act = async (body: Record<string, string>) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ ok: boolean; message: string }>("companies", {
      method: "POST",
      body: JSON.stringify({ domain: c.domain, ...body }),
    });
    setBusy(false);
    setMsg(r.ok ? r.data.message : r.error.message);
    setV(Date.now());
    onChanged();
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type) || file.size > 256 * 1024)
      return setMsg("Use a PNG, JPEG, GIF, WebP or ICO image under 256 KB.");
    const reader = new FileReader();
    reader.onload = () =>
      void act({
        action: "upload",
        type: file.type,
        data: String(reader.result).split(",")[1] ?? "",
      });
    reader.readAsDataURL(file);
  };
  return (
    <span className="flex items-start gap-2">
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-surface text-[15px] font-bold text-brand-600">
        {c.name.trim()[0]?.toUpperCase()}
        {c.hasLogo && (
          // eslint-disable-next-line @next/next/no-img-element -- a small icon from our own logo API
          <img
            src={`/api/company-logo?d=${encodeURIComponent(c.domain)}&n=${encodeURIComponent(c.name)}&a=${v}`}
            alt=""
            className="absolute inset-0 size-full bg-surface object-contain p-[12%]"
          />
        )}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-[11.5px] text-ink-3">
          {c.hasLogo
            ? "Has a logo"
            : c.logoChecked
              ? "None found"
              : "Not looked for yet"}
        </span>
        <span className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            loading={busy}
            onClick={() => void act({ action: "refetch" })}
          >
            Fetch again
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center rounded-[10px] border border-line px-2.5 text-[12.5px] font-medium text-ink hover:bg-bg-soft">
            Upload
            <input
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="sr-only"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {c.hasLogo && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void act({ action: "clear" })}
            >
              Remove
            </Button>
          )}
        </span>
        {msg && <span className="text-[11.5px] text-ink-3">{msg}</span>}
      </span>
    </span>
  );
}

/** What a company's facts say, one line per fact, each with the source it came from. */
function Facts({ c }: { c: DirectoryCompany }) {
  const lines = companyLines({
    name: c.name,
    facts: c.facts,
    wikidata: c.wikidata ?? undefined,
    ratings: c.ratings ?? undefined,
    ratingsAt: c.ratingsAt,
    h1b: c.h1b,
    openJobs: c.openJobs,
    newJobs7d: c.newJobs7d,
  });
  if (!lines.length) return <span className="text-ink-4">None yet</span>;
  return (
    <ul className="space-y-0.5">
      {lines.map((l) => (
        <li key={l.label} className="text-[12.5px] text-ink-2">
          <span className="text-ink-3">{l.label}:</span> {l.value}{" "}
          <span className="text-[11.5px] text-ink-4">· {l.source}</span>
        </li>
      ))}
    </ul>
  );
}

const checked = (c: DirectoryCompany) =>
  [
    c.factsAt && `TheirStack ${relativeTime(c.factsAt)}`,
    c.wikidataAt &&
      `Wikidata ${relativeTime(c.wikidataAt)}${c.wikidata ? "" : " (none)"}`,
  ]
    .filter(Boolean)
    .join(" · ") || "Never";

/** The company directory: every employer WorksLake has recorded from a real posting, with what its sources say about it. */
export default function CompaniesPage() {
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [offset, setOffset] = useState(0);
  const [missing, setMissing] = useState(false);
  const [bannedOnly, setBannedOnly] = useState(false);
  const { data, error, reload, loading } = useAdmin<{
    total: number;
    missingLogos: number;
    banned: number;
    companies: DirectoryCompany[];
  }>(
    `companies?limit=${PAGE}&offset=${offset}&q=${encodeURIComponent(applied)}${missing ? "&missing=1" : ""}${bannedOnly ? "&banned=1" : ""}`,
  );
  return (
    <>
      <PageTitle
        title="Directory & logos"
        subtitle="Every company, school and organiser WorksLake recorded from a real listing, in every module, by its website domain — with what each source says about it. Most open roles first."
      />
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(q);
        }}
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name or domain"
          aria-label="Search companies"
          className="h-10"
        />
        <Button type="submit" size="sm" className="h-10">
          Search
        </Button>
      </form>
      {data && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip
            active={missing}
            onClick={() => (setOffset(0), setMissing((m) => !m))}
          >
            Missing logos {num(data.missingLogos)}
          </Chip>
          <Chip
            active={bannedOnly}
            onClick={() => (setOffset(0), setBannedOnly((b) => !b))}
          >
            Banned {num(data.banned ?? 0)}
          </Chip>
          {missing && data.missingLogos > 0 && <FetchMissing onDone={reload} />}
        </div>
      )}
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel
          title={`${num(data.total)} ${data.total === 1 ? "company" : "companies"}`}
        >
          <ResponsiveTable
            rows={data.companies}
            rowKey={(c) => c.domain}
            empty={
              applied
                ? "No company matches."
                : "No companies recorded yet. They're added as searches and the daily refresh read postings."
            }
            columns={[
              {
                header: "Company",
                cell: (c) => (
                  <span className="block">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="block text-[12px] text-ink-3">
                      {c.domain}
                    </span>
                    <BanCell c={c} onChanged={reload} />
                  </span>
                ),
              },
              {
                header: "Logo",
                cell: (c) => <LogoCell c={c} onChanged={reload} />,
              },
              {
                header: "Open roles",
                cell: (c) =>
                  c.openJobs === undefined
                    ? "—"
                    : `${num(c.openJobs)}${c.newJobs7d ? ` (${num(c.newJobs7d)} new)` : ""}`,
                className: "tabular-nums text-right whitespace-nowrap",
              },
              { header: "Facts", cell: (c) => <Facts c={c} /> },
              {
                header: "Seen via · checked",
                cell: (c) => (
                  <span className="block text-[12px] text-ink-3">
                    {c.sources.join(", ") || "—"}
                    <span className="block">{checked(c)}</span>
                  </span>
                ),
              },
            ]}
            card={(c) => (
              <div className="text-[13px]">
                <div className="mb-1.5">
                  <LogoCell c={c} onChanged={reload} />
                </div>
                <p className="font-medium text-ink">
                  {c.name}{" "}
                  <span className="font-normal text-ink-3">· {c.domain}</span>
                </p>
                <p className="text-[12px] text-ink-3">
                  {c.openJobs === undefined
                    ? "Not counted yet"
                    : `${num(c.openJobs)} open roles${c.newJobs7d ? ` · ${num(c.newJobs7d)} new this week` : ""}`}{" "}
                  · seen via {c.sources.join(", ") || "—"}
                </p>
                <div className="mt-1">
                  <Facts c={c} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-4">
                  Checked: {checked(c)}
                </p>
                <BanCell c={c} onChanged={reload} />
              </div>
            )}
          />
          {data.total > PAGE && (
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
              <span>
                {num(offset + 1)}–{num(Math.min(offset + PAGE, data.total))} of{" "}
                {num(data.total)}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + PAGE >= data.total || loading}
                  onClick={() => setOffset(offset + PAGE)}
                >
                  Next
                </Button>
              </span>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}

/**
 * Looks again for every missing logo, a pass at a time (each within the server's time limit), until none is left to
 * try, and says how many it found. Ones with no logo on their site stay for Upload.
 */
function FetchMissing({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const since = new Date().toISOString();
          let checked = 0;
          let found = 0;
          for (let pass = 0; pass < 50; pass++) {
            const r = await adminFetch<{
              checked: number;
              found: number;
              remaining: number;
              missing: number;
            }>("companies", {
              method: "POST",
              body: JSON.stringify({ action: "fetch_missing", since }),
            });
            if (!r.ok) {
              setMsg(r.error.message);
              break;
            }
            checked += r.data.checked;
            found += r.data.found;
            setMsg(
              `Looked for ${num(checked)}, found ${num(found)}${r.data.remaining ? ` · ${num(r.data.remaining)} to go…` : ""}`,
            );
            if (!r.data.remaining || !r.data.checked) {
              setMsg(
                `Found ${num(found)} of ${num(checked)} logos. ${r.data.missing ? `${num(r.data.missing)} have none on their site; upload those.` : "None missing now."}`,
              );
              break;
            }
          }
          setBusy(false);
          onDone();
        }}
      >
        Fetch all missing
      </Button>
      {msg && <span className="text-[12px] text-ink-3">{msg}</span>}
    </span>
  );
}

/**
 * Ban a company (its listings leave every module's searches) with a reason, or lift the ban. One quiet link until it's
 * used, so the directory stays calm; a banned company shows why, when and by whom.
 */
function BanCell({
  c,
  onChanged,
}: {
  c: DirectoryCompany;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (body: Record<string, string>) => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ ok: boolean; message: string }>("companies", {
      method: "POST",
      body: JSON.stringify({ domain: c.domain, ...body }),
    });
    setBusy(false);
    if (!r.ok) return setMsg(r.error.message);
    setOpen(false);
    setReason("");
    onChanged();
  };
  if (c.ban)
    return (
      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="rounded-full bg-danger-100 px-2 py-0.5 font-medium text-danger-600">
          Banned
        </span>
        <span className="text-ink-3">
          {c.ban.reason} · {relativeTime(c.ban.at)}
          {c.ban.by ? ` by ${c.ban.by}` : ""}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ action: "unban" })}
          className="font-medium text-brand-600 hover:underline"
        >
          Unban
        </button>
        {msg && <span className="text-danger-600">{msg}</span>}
      </span>
    );
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 block text-[12px] font-medium text-danger-600 hover:underline"
      >
        Ban…
      </button>
    );
  return (
    <form
      className="mt-1.5 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send({ action: "ban", reason });
      }}
    >
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        placeholder="Why (e.g. scam listings)"
        aria-label={`Why ban ${c.name}`}
        className="h-9 min-w-0 flex-1 text-[13px]"
        autoFocus
      />
      <Button
        type="submit"
        size="sm"
        variant="danger"
        loading={busy}
        disabled={reason.trim().length < 3}
      >
        Ban
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12px] text-ink-3 hover:underline"
      >
        Cancel
      </button>
      {msg && <span className="w-full text-[12px] text-danger-600">{msg}</span>}
      <span className="w-full text-[11.5px] text-ink-4">
        Its listings will be left out of every module&apos;s searches.
      </span>
    </form>
  );
}
