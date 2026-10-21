"use client";
import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ORG_ROLE_HELP, ORG_ROLE_LABEL, type Membership, type OrgInvite, type OrgRole, type Organization } from "@/domain/org/types";
import { companyProblem } from "@/domain/org/company";
import { ORG_ROLES } from "@/domain/org/permissions";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Input, Select } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";

/** Who's in the workspace and in which role. Owners invite people by email, change roles and remove people; anyone can leave. */
export function TeamTab({ orgId, org, me, canManage, onLeft, onRenamed }: { orgId: string; org: Organization; me: string; canManage: boolean; onLeft: () => void; onRenamed: () => void }) {
  const [team, setTeam] = useState<{ members: Membership[]; invites: OrgInvite[] } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("recruiter");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    hiringApi
      .team(orgId)
      .then(setTeam)
      .catch((e: Error) => toast.error("Couldn't load the team", e.message));
  }, [orgId]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
    }
  };

  if (!team) return <p className="text-[13px] text-ink-3">Loading…</p>;
  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <form
          className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-4 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await act(() => hiringApi.invite(orgId, email, role), `Invitation saved for ${email}`);
            setEmail("");
            setBusy(false);
          }}
        >
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" aria-label="Email to invite" className="flex-1" required />
          <Select value={role} onChange={(e) => setRole(e.target.value as OrgRole)} aria-label="Role" className="sm:w-44">
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={busy} icon={<UserPlus className="size-4" aria-hidden />}>
            Invite
          </Button>
        </form>
      )}
      {canManage && <p className="-mt-2 text-[12px] text-ink-3">They join by signing in to WonderJobs with that email and opening Hiring, where the invitation waits.</p>}

      <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
        {team.members.map((m) => (
          <li key={m.tenantId} className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {m.name || m.email || "Member"}
                {m.tenantId === me && <span className="font-normal text-ink-3"> (you)</span>}
              </p>
              <p className="truncate text-[12px] text-ink-3">{m.email}</p>
            </div>
            {canManage ? (
              <Select value={m.role} onChange={(e) => act(() => hiringApi.setRole(orgId, m.tenantId, e.target.value as OrgRole), "Role changed")} aria-label={`Role of ${m.name || m.email}`} className="w-44">
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ORG_ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-[13px] text-ink-2">{ORG_ROLE_LABEL[m.role]}</span>
            )}
            {(canManage || m.tenantId === me) && (
              <button
                type="button"
                onClick={() =>
                  act(async () => {
                    await hiringApi.removeMember(orgId, m.tenantId);
                    if (m.tenantId === me) onLeft();
                  }, m.tenantId === me ? "You left the workspace" : "Removed")
                }
                className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-danger-600"
              >
                {m.tenantId === me ? "Leave" : "Remove"}
              </button>
            )}
          </li>
        ))}
        {team.invites.map((i) => (
          <li key={i.id} className="flex items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-ink">{i.email}</p>
              <p className="text-[12px] text-ink-3">Invited as {ORG_ROLE_LABEL[i.role]} · waiting to join</p>
            </div>
            <button type="button" onClick={() => act(() => hiringApi.cancelInvite(orgId, i.id), "Invitation withdrawn")} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
              Withdraw
            </button>
          </li>
        ))}
      </ul>

      {canManage && <CompanyDetails org={org} onSaved={onRenamed} />}

      <Fold title="What each role can do">
        <ul className="flex flex-col gap-2 text-[13px]">
          {ORG_ROLES.map((r) => (
            <li key={r}>
              <span className="font-semibold text-ink">{ORG_ROLE_LABEL[r]}:</span> <span className="text-ink-2">{ORG_ROLE_HELP[r]}</span>
            </li>
          ))}
        </ul>
      </Fold>
    </div>
  );
}

/** The company's name and website, which job seekers see on its open jobs. Owners only. */
function CompanyDetails({ org, onSaved }: { org: Organization; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [website, setWebsite] = useState(org.website ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== org.name || website.trim() !== (org.website ?? "");
  const save = async () => {
    const problem = companyProblem({ name, website });
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const saved = await hiringApi.updateWorkspace(org.id, name.trim(), website.trim());
      setWebsite(saved.website ?? "");
      toast.success("Company details saved", "Your open jobs show them to job seekers now.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Fold title="Company name and website" hint={[org.name, org.website?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}>
      <div className="flex flex-col gap-3">
        <Field label="Company name" htmlFor="org-name" required>
          <Input id="org-name" value={name} onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }} maxLength={120} />
        </Field>
        <Field label="Website" htmlFor="org-website" hint={org.verified ? "Changing the name or website asks WonderJobs to verify the company again." : undefined}>
          <Input id="org-website" value={website} onChange={(e) => {
              setWebsite(e.target.value);
              setError(null);
            }} placeholder="company.com" maxLength={300} />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] text-danger-600">
            {error}
          </p>
        )}
        <Button className="self-start" onClick={save} loading={busy} disabled={!changed}>
          Save
        </Button>
      </div>
    </Fold>
  );
}
