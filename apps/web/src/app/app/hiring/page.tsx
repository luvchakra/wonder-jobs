"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, ShieldAlert } from "lucide-react";
import { can } from "@/domain/org/permissions";
import { ORG_ROLE_LABEL } from "@/domain/org/types";
import { hiringApi } from "@/services/hiring/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, Input, Select } from "@/components/common/Input";
import { Tabs } from "@/components/common/Tabs";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { JobsTab } from "@/components/hiring/JobsTab";
import { TalentTab } from "@/components/hiring/TalentTab";
import { ShortlistTab } from "@/components/hiring/ShortlistTab";
import { MessagesTab } from "@/components/hiring/MessagesTab";
import { TeamTab } from "@/components/hiring/TeamTab";
import { ApplicationsTab } from "@/components/hiring/ApplicationsTab";

type Tab = "jobs" | "applications" | "talent" | "shortlist" | "messages" | "team";
type Data = Awaited<ReturnType<typeof hiringApi.workspaces>>;

/**
 * Hiring (owner, 2026-10-20): a company's workspace on WonderJobs. Post jobs that job seekers find in their
 * searches, find candidates who are open to recruiters, shortlist and report them to hiring managers, and write to
 * them. The tabs shown follow the person's role; the server checks the role again on every action.
 */
function HiringPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(() => {
    hiringApi
      .workspaces()
      .then((d) => {
        setData(d);
        setOrgId((cur) => (cur && d.workspaces.some((w) => w.org.id === cur) ? cur : (d.workspaces[0]?.org.id ?? null)));
      })
      .catch((e: Error) => toast.error("Couldn't load Hiring", e.message));
  }, []);
  useEffect(load, [load]);

  const ws = data?.workspaces.find((w) => w.org.id === orgId);
  const tabs = useMemo(() => {
    if (!ws) return [];
    const r = ws.role;
    return [
      can(r, "jobs.view") && { value: "jobs" as const, label: "Jobs" },
      can(r, "applications.view") && { value: "applications" as const, label: "Applications" },
      can(r, "talent.search") && { value: "talent" as const, label: "Talent" },
      can(r, "shortlist.view") && { value: "shortlist" as const, label: can(r, "shortlist.edit") ? "Shortlist" : "Reports" },
      can(r, "messages.view") && { value: "messages" as const, label: "Messages" },
      { value: "team" as const, label: "Team" },
    ].filter(Boolean) as { value: Tab; label: string }[];
  }, [ws]);
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some((t) => t.value === asked) ? asked! : (tabs[0]?.value ?? "team");
  const openConversation = params.get("c");
  const openApplication = params.get("a");
  const go = (t: Tab, c?: string | null) => router.replace(`/app/hiring?tab=${t}${c ? `&c=${c}` : ""}`);

  if (!data) return <PageLoading />;
  if (!ws) return <Start data={data} onChange={load} />;
  const r = ws.role;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={ws.org.name}
        description={`Hiring workspace · you're ${ORG_ROLE_LABEL[r] === "Owner" ? "an Owner" : `a ${ORG_ROLE_LABEL[r]}`}`}
        actions={
          data.workspaces.length > 1 ? (
            <Select value={ws.org.id} onChange={(e) => setOrgId(e.target.value)} aria-label="Workspace" className="w-48">
              {data.workspaces.map((w) => (
                <option key={w.org.id} value={w.org.id}>
                  {w.org.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {!ws.org.verified && (
        <p className="mb-4 flex items-start gap-2 rounded-[14px] border border-warning-600/30 bg-warning-100/40 px-3 py-2 text-[12px] text-ink-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-600" aria-hidden /> Not verified yet: your open jobs tell job seekers WonderJobs hasn&apos;t checked this company.
        </p>
      )}
      <Tabs value={tab} onChange={(t) => go(t)} items={tabs} label="Hiring" variant="underline" className="mb-4" />
      {tab === "jobs" && <JobsTab orgId={ws.org.id} canEdit={can(r, "jobs.edit")} canManage={can(r, "org.manage")} />}
      {tab === "applications" && <ApplicationsTab orgId={ws.org.id} canDecide={can(r, "applications.decide")} openId={openApplication} />}
      {tab === "talent" && <TalentTab orgId={ws.org.id} onShortlisted={() => setRefresh((n) => n + 1)} onMessaged={(id) => go("messages", id)} />}
      {tab === "shortlist" && <ShortlistTab orgId={ws.org.id} canEdit={can(r, "shortlist.edit")} canDecide={can(r, "shortlist.decide")} refresh={refresh} />}
      {tab === "messages" && <MessagesTab orgId={ws.org.id} openId={openConversation} onOpen={(id) => go("messages", id)} refresh={refresh} />}
      {tab === "team" && <TeamTab orgId={ws.org.id} me={data.me} canManage={can(r, "org.manage")} onLeft={load} />}
    </div>
  );
}

/** No workspace yet: invitations waiting for this email, or create the company's workspace. */
function Start({ data, onChange }: { data: Data; onChange: () => void }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const answer = async (id: string, action: "accept" | "decline") => {
    try {
      await hiringApi.answerInvite(id, action);
      toast.success(action === "accept" ? "You joined the workspace" : "Invitation declined");
      onChange();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Hiring" description="For employers and recruiters: post jobs, find candidates who are open to recruiters, and talk to them." />
      {data.invites.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-[15px] font-semibold text-ink">Invitations</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-[14px] text-ink">
                  <span className="font-semibold">{i.orgName}</span> invited you as {ORG_ROLE_LABEL[i.role]}
                </span>
                <Button size="sm" icon={<Check className="size-4" aria-hidden />} onClick={() => answer(i.id, "accept")}>
                  Join
                </Button>
                <button type="button" onClick={() => answer(i.id, "decline")} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
                  Decline
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          <Building2 className="size-4 text-brand-600" aria-hidden /> Set up your company
        </h2>
        <p className="mt-1 text-[13px] text-ink-3">You&apos;ll be its Owner, and can invite hiring managers and recruiters. Your job seeker account stays as it is.</p>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await hiringApi.create(name, website);
              toast.success(`${name} is set up`, "Post your first job, or invite your team.");
              onChange();
            } catch (err) {
              toast.error("Couldn't set it up", (err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Company name" htmlFor="cn" required>
            <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <Field label="Website (optional)" htmlFor="cw">
            <Input id="cw" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://company.com" maxLength={300} />
          </Field>
          <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
            Create workspace
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HiringPage />
    </Suspense>
  );
}

