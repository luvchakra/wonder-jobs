"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented, Select, Switch, Textarea } from "@/components/common/Input";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { cleanTeam, COMMITMENTS, DECISION_LABEL, EMPTY_TEAM, MAX_OPEN_ROLES, MAX_FOUNDERS, ROLES, STAGES, teamMay, type Commitment, type Decision, type OpenRole, type Stage, type Team } from "../domain";

type MyTeam = { id: string; role: "founder" | "member"; team: Team; closed: boolean; people: { tenant: string; role: "founder" | "member"; name: string; headline: string; me: boolean }[] };

/**
 * Co-founders → Your teams: start a team, list it with the roles it needs, choose how its founders decide, see who is on
 * it and who asked to join (answered in Connections). Only a founder edits it; a joined member can leave. The last
 * founder closes it. Each action is checked again on the server against the person's role.
 */
export function CofoundersTeams() {
  const [teams, setTeams] = useState<MyTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MyTeam | "new" | null>(null);
  const load = () =>
    call<{ teams: MyTeam[] }>("/api/m/cofounders/teams")
      .then((r) => (setTeams(r.teams), setError(null)))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const act = async (id: string, body: Record<string, unknown>, ok: string) => {
    try {
      await call(`/api/m/cofounders/teams/${encodeURIComponent(id)}`, { body });
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };
  if (error) return <ErrorState title="Couldn't load your teams" body={error} actions={[{ label: "Try again", onClick: () => void load() }]} />;
  if (!teams) return <PageLoading rows={3} />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your teams" back={{ href: "/app/m/cofounders/you", label: "You" }} actions={<Button size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setForm("new")}>Start a team</Button>} />
      {form && <TeamForm key={form === "new" ? "new" : form.id} existing={form === "new" ? null : form} onDone={(saved) => (setForm(null), saved && void load())} />}
      {!form && teams.length === 0 && <EmptyState title="No team yet" body="Start one when you have an idea and want more co-founders. You need a saved profile first: a team's founders are people." action={{ label: "Start a team", onClick: () => setForm("new") }} />}
      {!form && (
        <ul className="flex flex-col gap-3">
          {teams.map((t) => (
            <li key={t.id} className="wj-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink">{t.team.name}</p>
                  <p className="text-[13px] text-ink-3">{t.team.idea}</p>
                </div>
                <Badge tone={t.closed ? "neutral" : t.team.open ? "success" : "warning"}>{t.closed ? "Closed" : t.team.open ? "Listed" : "Not listed"}</Badge>
              </div>
              <ul className="text-[13px] text-ink-2" aria-label="People on the team">
                {t.people.map((p) => (
                  <li key={p.tenant} className="flex items-center justify-between gap-2 py-1">
                    <span className="truncate">{p.name}{p.me ? " (you)" : ""} <span className="text-ink-4">· {p.role === "founder" ? "Founder" : "Member"}</span></span>
                    {teamMay(t.role, "decide") && p.role === "member" && t.people.filter((x) => x.role === "founder").length < MAX_FOUNDERS && (
                      <Button size="sm" variant="ghost" onClick={() => act(t.id, { action: "promote", tenant: p.tenant }, "Made a founder")}>
                        Make founder
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-ink-3">Requests to join and invitations are answered in <Link className="font-medium text-brand-600 hover:underline" href="/app/m/cofounders/pipeline">Connections</Link>. {DECISION_LABEL[t.team.decision]}.</p>
              {!t.closed && (
                <div className="flex flex-wrap gap-2">
                  {teamMay(t.role, "edit") && <Button size="sm" variant="outline" onClick={() => setForm(t)}>Edit</Button>}
                  {t.role === "member" || t.people.filter((x) => x.role === "founder").length > 1 ? (
                    <Button size="sm" variant="ghost" onClick={() => act(t.id, { action: "leave" }, "You left the team")}>Leave</Button>
                  ) : null}
                  {teamMay(t.role, "close") && (
                    <Button size="sm" variant="ghost" onClick={() => window.confirm("Close this team? It leaves Find and every open request and conversation with it ends.") && act(t.id, { action: "close" }, "Team closed")}>
                      Close team
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamForm({ existing, onDone }: { existing: MyTeam | null; onDone: (saved: boolean) => void }) {
  const [t, setT] = useState<Team>(existing?.team ?? EMPTY_TEAM);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof Team>(k: K, v: Team[K]) => setT((x) => ({ ...x, [k]: v }));
  const role = (i: number, patch: Partial<OpenRole>) => set("openRoles", t.openRoles.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    const c = cleanTeam(t);
    if ("problem" in c) return setProblem(c.problem);
    setProblem(null);
    setBusy(true);
    try {
      if (existing) await call(`/api/m/cofounders/teams/${encodeURIComponent(existing.id)}`, { method: "PUT", body: c.value });
      else await call("/api/m/cofounders/teams", { body: c.value });
      toast.success("Saved");
      onDone(true);
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field label="Team or startup name" htmlFor="tm-name">
        <Input id="tm-name" value={t.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="What you're building" htmlFor="tm-idea" hint="One sentence. Everyone who finds the team sees it.">
        <Input id="tm-idea" value={t.idea} maxLength={140} onChange={(e) => set("idea", e.target.value)} />
      </Field>
      <Field label="More detail" htmlFor="tm-desc">
        <Textarea id="tm-desc" rows={3} maxLength={1500} value={t.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <Field label="Stage">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <Chip key={s} active={t.stage === s} onClick={() => set("stage", s as Stage)}>
              {s}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Roles you're looking for" hint={`Up to ${MAX_OPEN_ROLES}. People can ask to join only for an open role.`}>
        <div className="space-y-2">
          {t.openRoles.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Select aria-label="Role" value={r.role} onChange={(e) => role(i, { role: e.target.value as OpenRole["role"] })} className="max-w-[120px]">
                {ROLES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
              <Input aria-label="Skills, separated by commas" value={r.skills.join(", ")} onChange={(e) => role(i, { skills: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Skills, e.g. Sales, Marketing" />
              <Button type="button" size="sm" variant="ghost" onClick={() => set("openRoles", t.openRoles.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          {t.openRoles.length < MAX_OPEN_ROLES && (
            <Button type="button" size="sm" variant="outline" onClick={() => set("openRoles", [...t.openRoles, { role: "Business", skills: [] }])}>
              Add a role
            </Button>
          )}
        </div>
      </Field>
      <Field label="Commitment you expect">
        <Segmented<Commitment | ""> label="Commitment" value={t.commitment ?? ""} onChange={(v) => set("commitment", v || undefined)} options={[{ value: "", label: "Not stated" }, ...COMMITMENTS.map((c) => ({ value: c, label: c }))]} />
      </Field>
      <Field label="City" htmlFor="tm-loc">
        <Input id="tm-loc" value={t.location} maxLength={80} onChange={(e) => set("location", e.target.value)} />
      </Field>
      <Field label="Equity" htmlFor="tm-eq">
        <Input id="tm-eq" value={t.equity} maxLength={200} onChange={(e) => set("equity", e.target.value)} />
      </Field>
      <Field label="Who can accept a request to join" hint="Applies to people who ask and to people you invite.">
        <Segmented<Decision> label="Who can accept" value={t.decision} onChange={(v) => set("decision", v)} options={(Object.keys(DECISION_LABEL) as Decision[]).map((d) => ({ value: d, label: DECISION_LABEL[d] }))} />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 p-3">
        <span className="text-[13px] text-ink-2">List the team so people can find it</span>
        <Switch checked={t.open} onChange={(v) => set("open", v)} label="List the team" />
      </div>
      {problem && <p className="text-[13px] text-danger-600">{problem}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
