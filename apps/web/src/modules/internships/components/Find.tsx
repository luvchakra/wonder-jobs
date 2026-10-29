"use client";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { GraduationCap, Search } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input, Select, Switch } from "@/components/common/Input";
import { PlaceInput } from "@/components/common/PlaceInput";
import { EmptyState, ErrorState } from "@/components/common/States";
import { call } from "../api";
import { applyFacets, DURATIONS, facetCount, type Facets, type InternshipListing } from "../domain";
import { selectProfile, useInternshipsStore } from "../store";
import { InternshipCard, InternshipSheet } from "./Listing";

type SourceLine = { id: string; name: string; state: "ok" | "empty" | "needs_setup" | "unavailable" | "skipped"; count: number; message?: string };
type Run = { searched: { query: string; places: string[] }; results: InternshipListing[]; sources: SourceLine[] };

const PAGE = 20;
const noop = () => () => undefined;
const STATE_LABEL: Record<SourceLine["state"], string> = { ok: "", empty: "none found", needs_setup: "Needs setup", unavailable: "Unavailable", skipped: "not asked" };

/**
 * Internships Find (WJ-418): the student's field and places, searched across the Internships dataset's own sources
 * (WonderStar companies, Adzuna, company career sites, Remotive, Remote OK). Opening the page searches nothing; the
 * field starts from their last search or their course, and when there's neither it asks. Refine: stipend, duration,
 * start month, remote. Every run says what it searched, where, and what each source gave.
 */
export function InternshipsFind() {
  const recent = useInternshipsStore((s) => s.recentSearches[0]);
  const course = useInternshipsStore((s) => selectProfile(s)?.course);
  // Persisted values exist only in the browser: read them after mount, so the first render matches the server's.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [typed, setQuery] = useState<string | null>(null);
  const query = typed ?? (mounted ? (recent ?? course ?? "") : "");
  const [places, setPlaces] = useState<string[]>([]);
  const [facets, setFacets] = useState<Facets>({});
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const go = async () => {
    const q = query.trim();
    if (!q) {
      setError("Say what field you want to intern in — for example what you study.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await call<Run>("/api/m/internships/search", { body: { query: q, places } });
      useInternshipsStore.getState().rememberSearch(q);
      setRun(r);
      setShown(PAGE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const { kept, hidden } = useMemo(() => applyFacets(run?.results ?? [], facets), [run, facets]);
  const onOpen = useCallback((id: string) => setOpen(id), []);
  const active = facetCount(facets);
  const where = run?.searched.places.length ? run.searched.places.join(", ") : "anywhere";
  const asked = run?.sources.filter((s) => s.state === "ok" || s.state === "empty") ?? [];

  return (
    <div>
      <form
        className="wj-card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
      >
        <Field label="Field or role" htmlFor="in-q">
          <Input id="in-q" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off" />
        </Field>
        <Field label="Where (optional)" htmlFor="in-where">
          <PlaceInput id="in-where" label="Where" places={places} onChange={setPlaces} />
        </Field>
        <Button type="submit" full loading={busy} icon={<Search className="size-4" aria-hidden />}>
          Search internships
        </Button>
      </form>

      <Fold title="Refine" hint={active ? `${active} on` : "Stipend, duration, start month, remote"} className="mt-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stipend a month, at least" htmlFor="in-stipend">
            <Input id="in-stipend" inputMode="numeric" value={facets.minStipend ?? ""} onChange={(e) => setFacets((f) => ({ ...f, minStipend: Number(e.target.value.replace(/\D/g, "")) || undefined }))} />
          </Field>
          <Field label="Duration, at most" htmlFor="in-months">
            <Select id="in-months" value={facets.maxMonths ?? ""} onChange={(e) => setFacets((f) => ({ ...f, maxMonths: Number(e.target.value) || undefined }))}>
              <option value="">Any</option>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "month" : "months"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starts in" htmlFor="in-start">
            <Input id="in-start" type="month" value={facets.startMonth ?? ""} onChange={(e) => setFacets((f) => ({ ...f, startMonth: e.target.value || undefined }))} />
          </Field>
          <div className="flex items-end pb-2">
            <Switch label="Remote only" checked={!!facets.remoteOnly} onChange={(v) => setFacets((f) => ({ ...f, remoteOnly: v || undefined }))} />
          </div>
        </div>
      </Fold>

      {error && <ErrorState className="mt-4" title="Couldn't search" body={error} />}

      {run && (
        <div className="mt-4">
          <p className="text-[13px] text-ink-3">
            {kept.length} {kept.length === 1 ? "internship" : "internships"} for “{run.searched.query}” {run.searched.places.length ? `in ${where}` : "anywhere"}, across {asked.length} of {run.sources.length} sources
            {hidden ? ` · ${hidden} hidden by Refine` : ""}
          </p>
          <Fold title="Sources" hint="What each source gave" className="mt-2">
            <ul className="space-y-1 text-[13px]">
              {run.sources.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span className="text-ink-2">{s.name}</span>
                  <span className="text-ink-3">{s.state === "ok" ? s.count : s.state === "skipped" && s.message ? s.message : STATE_LABEL[s.state]}</span>
                </li>
              ))}
            </ul>
          </Fold>
          {kept.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<GraduationCap className="size-5" aria-hidden />}
              title="No internships found"
              body={
                hidden
                  ? `${hidden} found, all hidden by Refine. Loosen it to see them.`
                  : run.sources.some((s) => s.state === "needs_setup" || s.state === "unavailable")
                    ? `None of the sources that answered list a “${run.searched.query}” internship ${run.searched.places.length ? `in ${where}` : ""}; some sources couldn't be asked (see Sources). Try broader words or another place.`
                    : `None of the sources list a “${run.searched.query}” internship ${run.searched.places.length ? `in ${where}` : ""} right now. Try broader words or another place.`
              }
            />
          ) : (
            <>
              <ul className="mt-3 space-y-3">
                {kept.slice(0, shown).map((l) => (
                  <InternshipCard key={l.id} listing={l} onOpen={onOpen} />
                ))}
              </ul>
              {kept.length > shown && (
                <Button variant="outline" full className="mt-3" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {!run && !error && <EmptyState className="mt-4" icon={<GraduationCap className="size-5" aria-hidden />} title="Find an internship" body="Type the field you want to intern in and where, then search. Internships from WonderStar companies and real job sources show here." />}

      <InternshipSheet listing={kept.find((l) => l.id === open) ?? null} onClose={() => setOpen(null)} />
    </div>
  );
}
