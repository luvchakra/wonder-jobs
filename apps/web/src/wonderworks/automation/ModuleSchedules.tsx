"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { CADENCE_LABEL, MODULE_SCHEDULES_CAP, planCadence, type ModuleScheduleCadence, type ScheduleRunState } from "@/domain/moduleSchedules";
import { scheduleAllowance } from "@/domain/billing/plans";
import { usePlan } from "@/lib/usePlan";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Input, Select, Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { relativeTime } from "@/lib/format";
import { useModuleSchedules } from "./schedules";

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);
type Status = Record<string, Omit<ScheduleRunState, "seen" | "key"> & { held?: true }>;
const hourLabel = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

/**
 * Scheduled searches in every other module (owner, 2026-11-01): the same words and places that module's Find takes,
 * run by WonderWorks on a schedule. The first run learns what's there; after that you're told only about new listings.
 * The modules come from the composition root (WonderWorks imports no module), and so does how many Jobs scheduled
 * searches are on: the plan's limit counts across every module (owner, 2026-11-02).
 */
export function ModuleSchedules({ modules, jobsEnabled = 0 }: { modules: { id: string; label: string }[]; jobsEnabled?: number }) {
  const mounted = useMounted();
  const { plan, plans } = usePlan();
  /** May this schedule be on? Says why not, with the plan that allows it. */
  const allowed = (cadence: ModuleScheduleCadence, exceptId?: string) => {
    const others = jobsEnabled + useModuleSchedules.getState().schedules.filter((s) => s.enabled && s.id !== exceptId).length;
    const a = scheduleAllowance(plan, { plans, priceRefs: { pro: {}, max: {} } }, others, planCadence(cadence));
    if (!a.ok) toast.error("Your plan doesn't allow this", `${a.reason}${a.needs ? ` ${plans[a.needs].label} does.` : ""}`);
    return a.ok;
  };
  const schedules = useModuleSchedules((s) => s.schedules);
  const [status, setStatus] = useState<Status>({});
  useEffect(() => {
    if (!mounted || !schedules.length) return;
    let live = true;
    fetch("/api/m/schedules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runs?: Status } | null) => live && d?.runs && setStatus(d.runs))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mounted, schedules.length]);
  const label = (id: string) => modules.find((m) => m.id === id)?.label ?? id;
  if (!mounted || !modules.length) return null;

  return (
    <div className="mt-4">
      {schedules.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {schedules.map((s) => {
            const st = status[s.id];
            const last = st?.last;
            return (
              <li key={s.id} className="wj-card flex items-start gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {label(s.module)} · {s.query ? `“${s.query}”` : "Latest listings"}
                    {s.places.length ? ` in ${s.places.join(", ")}` : ""}
                  </span>
                  <span className="block text-ink-2">
                    {CADENCE_LABEL[s.cadence]} at {hourLabel(s.hour)} · tells you only about new listings
                  </span>
                  <span className="block text-[12px] text-ink-3">
                    {st?.lastRunAt ? `Last run ${relativeTime(st.lastRunAt)} · ${last?.error ?? (last?.fresh ? `${last.fresh} new of ${last.found}` : `${last?.found ?? 0} found, nothing new`)}` : "Hasn't run yet; the first run learns what's there"}
                    {st?.held ? " · held: your plan's scheduled searches are all in use" : s.enabled && st?.nextRunAt ? ` · next ${relativeTime(st.nextRunAt)}` : ""}
                  </span>
                </span>
                <Switch checked={s.enabled} onChange={(v) => (!v || allowed(s.cadence, s.id)) && useModuleSchedules.getState().setEnabled(s.id, v)} label={`${s.enabled ? "Pause" : "Resume"} this search`} />
                <button type="button" aria-label="Remove this scheduled search" onClick={() => useModuleSchedules.getState().remove(s.id)} className="grid size-8 shrink-0 place-items-center rounded-full text-ink-4 hover:bg-bg-soft hover:text-danger-600">
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {schedules.length < MODULE_SCHEDULES_CAP && <NewModuleSchedule modules={modules} allowed={allowed} />}
    </div>
  );
}

function NewModuleSchedule({ modules, allowed }: { modules: { id: string; label: string }[]; allowed: (c: ModuleScheduleCadence) => boolean }) {
  const [mod, setMod] = useState(modules[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("");
  const [cadence, setCadence] = useState<ModuleScheduleCadence>("daily");
  const [hour, setHour] = useState(8);
  return (
    <Fold title="Search another module on a schedule" hint="Internships, Teaching, Events and the rest">
      <form
        className="flex flex-col gap-2.5 pb-4 text-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!allowed(cadence)) return;
          const s = useModuleSchedules.getState().add({ module: mod, query, places: place.trim() ? [place] : [], cadence, hour });
          if (!s) return toast.error("Couldn't add it", `Up to ${MODULE_SCHEDULES_CAP} scheduled searches.`);
          toast.success("Scheduled", "The first run learns what's there; after that you're told only about new listings.");
          setQuery("");
          setPlace("");
        }}
      >
        <Select aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)}>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <Input aria-label="What to search for" placeholder="What to search for (empty: the latest listings)" value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} />
        <Input aria-label="Place" placeholder="Place (optional)" value={place} maxLength={80} onChange={(e) => setPlace(e.target.value)} />
        <div className="flex gap-2">
          <Select aria-label="How often" value={cadence} onChange={(e) => setCadence(e.target.value as ModuleScheduleCadence)} className="flex-1">
            {(Object.keys(CADENCE_LABEL) as ModuleScheduleCadence[]).map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select aria-label="At" value={hour} onChange={(e) => setHour(Number(e.target.value))} className="flex-1">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" className="self-start">
          Schedule it
        </Button>
      </form>
    </Fold>
  );
}
