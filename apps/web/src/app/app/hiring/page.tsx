"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Check, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/common/Modal";
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
import { WorkspaceSettings } from "@/components/hiring/WorkspaceSettings";
import { VerifyCompany } from "@/components/hiring/VerifyCompany";
import { WorkspacesTable, workspaceTotals } from "@/components/hiring/WorkspacesTable";
import { DeleteWorkspace } from "@/components/hiring/DeleteWorkspace";
import { Plus } from "lucide-react";
import type { Organization } from "@/domain/org/types";

type Tab = "jobs" | "applications" | "talent" | "shortlist" | "messages" | "team";
type Data = Awaited<ReturnType<typeof hiringApi.workspaces>>;

/**
 * Hiring (owner, 2026-10-20): a company's workspace on WonderJobs. Post jobs that job seekers find in their
 * searches, find candidates who are open to recruiters, shortlist and report them to hiring managers, and write to
 * them. The tabs shown follow the person's role; the server checks the role again on every action. One person can
 * belong to, and own, several workspaces. Hiring opens on a table of them (Open, and for Owners Edit and Delete);
 * `?org=` names the open one, so a link (e.g. from an email) goes straight into it, and the picker in the header
 * switches between them.
 */
function HiringPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [orgId, setOrgId] = useState<string | null>(params.get("org"));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [verifying, setVerifying] = useState(false);
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
  const applicationsJob = params.get("job");
  const toApplications = (job: string | null) => router.replace(`/app/hiring?${orgId ? `org=${encodeURIComponent(orgId)}&` : ""}tab=applications${job ? `&job=${encodeURIComponent(job)}` : ""}`);
  const go = (t: Tab, c?: string | null, org = orgId) => router.replace(`/app/hiring?${org ? `org=${encodeURIComponent(org)}&` : ""}tab=${t}${c ? `&c=${c}` : ""}`);
  const switchTo = (id: string) => {
    setOrgId(id);
    router.replace(`/app/hiring?org=${encodeURIComponent(id)}`);
  };

  if (!data) return <PageLoading />;
  // With no workspace named in the address, Hiring opens on the table of workspaces.
  const listView = !params.get("org") && !params.get("tab") && data.workspaces.length > 0;
  const dialogs = (
    <>
      {editing && (
        <WorkspaceSettings
          key={editing.id}
          org={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <DeleteWorkspace
          org={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setOrgId(null);
            router.replace("/app/hiring");
            load();
          }}
        />
      )}
      {creating && (
        <Modal open onClose={() => setCreating(false)} title="New hiring workspace" description="Another company you hire for. You'll be its Owner; your other workspaces stay as they are.">
          <NewWorkspaceForm
            onCreated={(id) => {
              setCreating(false);
              switchTo(id);
              load();
            }}
          />
        </Modal>
      )}
    </>
  );
  const totals = workspaceTotals(data.workspaces);
  if (listView)
    return (
      <div className="mx-auto max-w-4xl">
        {/* Hiring's own colour (teal), so it reads as the employer side of WonderJobs. */}
        <div className="mb-4 rounded-[18px] bg-gradient-to-br from-teal-600 to-cyan-700 px-4 py-3.5 text-white shadow-sm">
          <p className="text-[11.5px] font-medium uppercase tracking-wide text-teal-100">Hiring</p>
          <h1 className="text-[20px] font-semibold leading-tight">Your companies</h1>
          <p className="mt-1 text-[12.5px] text-teal-50">
            {totals.companies} {totals.companies === 1 ? "company" : "companies"} · {totals.openJobs} open {totals.openJobs === 1 ? "job" : "jobs"} · {totals.newApplications} new {totals.newApplications === 1 ? "application" : "applications"}
          </p>
        </div>
        <Invitations data={data} onChange={load} />
        <WorkspacesTable workspaces={data.workspaces} onOpen={(w) => switchTo(w.org.id)} onEdit={(w) => setEditing(w.org)} onDelete={(w) => setDeleting(w.org)} />
        <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
          New workspace
        </Button>
        {dialogs}
      </div>
    );
  if (!ws)
    return (
      <Start
        data={data}
        onChange={(id) => {
          if (id) switchTo(id);
          load();
        }}
      />
    );
  const r = ws.role;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={ws.org.name}
        description={`Hiring workspace · you're ${ORG_ROLE_LABEL[r] === "Owner" ? "an Owner" : `a ${ORG_ROLE_LABEL[r]}`}`}
        back={{ href: "/app/hiring", label: "All workspaces" }}
        actions={
          data.workspaces.length > 1 && (
            <Select value={ws.org.id} onChange={(e) => switchTo(e.target.value)} aria-label="Workspace" className="w-40 sm:w-44">
              {data.workspaces.map((w) => (
                <option key={w.org.id} value={w.org.id}>
                  {w.org.name}
                </option>
              ))}
            </Select>
          )
        }
      />
      {dialogs}
      {!ws.org.verified && (
        <p className="mb-4 flex flex-wrap items-start gap-x-2 gap-y-1 rounded-[14px] border border-warning-600/30 bg-warning-100/40 px-3 py-2 text-[12px] text-ink-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-600" aria-hidden />
          <span className="min-w-0 flex-1">Not verified yet: your open jobs tell job seekers WonderJobs hasn&apos;t checked this company. {can(r, "org.manage") ? "Verifying takes a minute with a work email on your company's domain." : "An Owner can verify it."}</span>
          {can(r, "org.manage") && (
            <button type="button" onClick={() => setVerifying(true)} className="font-semibold text-brand-600 hover:underline">
              Verify your company →
            </button>
          )}
        </p>
      )}
      {verifying && (
        <VerifyCompany
          org={ws.org}
          onClose={() => setVerifying(false)}
          onVerified={() => {
            setVerifying(false);
            load();
          }}
          onEditWorkspace={() => {
            setVerifying(false);
            setEditing(ws.org);
          }}
        />
      )}
      <Tabs value={tab} onChange={(t) => go(t)} items={tabs} label="Hiring" variant="underline" className="mb-4" />
      {tab === "jobs" && <JobsTab orgId={ws.org.id} canEdit={can(r, "jobs.edit")} canManage={can(r, "org.manage")} onApplicants={can(r, "applications.view") ? toApplications : undefined} />}
      {tab === "applications" && <ApplicationsTab orgId={ws.org.id} canDecide={can(r, "applications.decide")} openId={openApplication} jobId={applicationsJob} onJob={toApplications} />}
      {tab === "talent" && <TalentTab orgId={ws.org.id} onShortlisted={() => setRefresh((n) => n + 1)} onMessaged={(id) => go("messages", id)} />}
      {tab === "shortlist" && <ShortlistTab orgId={ws.org.id} canEdit={can(r, "shortlist.edit")} canDecide={can(r, "shortlist.decide")} refresh={refresh} />}
      {tab === "messages" && <MessagesTab orgId={ws.org.id} openId={openConversation} onOpen={(id) => go("messages", id)} refresh={refresh} />}
      {tab === "team" && <TeamTab orgId={ws.org.id} me={data.me} canManage={can(r, "org.manage")} onLeft={load} />}
    </div>
  );
}

/** No workspace yet: invitations waiting for this email, or create the company's workspace. */
function Start({ data, onChange }: { data: Data; onChange: (orgId?: string) => void }) {

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Hiring" description="For employers and recruiters: post jobs, find candidates who are open to recruiters, and talk to them." />
      <Invitations data={data} onChange={onChange} />
      <Card>
        <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          <Building2 className="size-4 text-brand-600" aria-hidden /> Set up your company
        </h2>
        <p className="mt-1 text-[13px] text-ink-3">You&apos;ll be its Owner, and can invite hiring managers and recruiters. Your job seeker account stays as it is.</p>
        <div className="mt-3">
          <NewWorkspaceForm onCreated={(id) => onChange(id)} />
        </div>
      </Card>
    </div>
  );
}



/** Invitations waiting for this email: join or decline. */
function Invitations({ data, onChange }: { data: Data; onChange: (orgId?: string) => void }) {
  const answer = async (id: string, action: "accept" | "decline") => {
    try {
      await hiringApi.answerInvite(id, action);
      toast.success(action === "accept" ? "You joined the workspace" : "Invitation declined");
      onChange();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };
  if (!data.invites.length) return null;
  return (
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
  );
}

/** The company's name and website; the creator becomes its Owner. Used for the first workspace and for each new one. */
function NewWorkspaceForm({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const w = await hiringApi.create(name, website);
          toast.success(`${w.org.name} is set up`, "Post your first job, or invite your team.");
          onCreated(w.org.id);
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
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HiringPage />
    </Suspense>
  );
}

