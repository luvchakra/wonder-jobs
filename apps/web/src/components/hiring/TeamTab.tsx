"use client";
import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { ORG_ROLE_HELP, ORG_ROLE_LABEL, type Membership, type OrgInvite, type OrgRole } from "@/domain/org/types";
import { ORG_ROLES } from "@/domain/org/permissions";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Input, Select } from "@/components/common/Input";
import { Fold } from "@/components/common/Fold";
import { toast } from "@/components/feedback/Toast";

/** Who's in the workspace and in which role. Owners invite people by email, change roles and remove people; anyone can leave. */
export function TeamTab({ orgId, me, canManage, onLeft }: { orgId: string; me: string; canManage: boolean; onLeft: () => void }) {
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
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" aria-label="Email to invite" className="sm:flex-1" required />
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
      {canManage && <p className="-mt-2 text-[12px] text-ink-3">They join by signing in to WonderStar with that email and opening Hiring, where the invitation waits.</p>}

      <ul className="overflow-hidden rounded-[16px] border border-line bg-surface">
        {team.members.map((m) => {
          // The only owner can't step down or leave (the server refuses it too): neither is offered.
          const soleOwner = m.role === "owner" && team.members.filter((x) => x.role === "owner").length === 1;
          return (
          <li key={m.tenantId} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
            {/* On a phone the name takes the whole first line; the role and Leave/Remove share the next. */}
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <p className="truncate text-[14px] font-semibold text-ink">
                {m.name || m.email || "Member"}
                {m.tenantId === me && <span className="font-normal text-ink-3"> (you)</span>}
              </p>
              {/* The email under the name — not again when it already is the name. */}
              {m.name && m.email && m.name !== m.email && <p className="truncate text-[12px] text-ink-3">{m.email}</p>}
            </div>
            {canManage && !soleOwner ? (
              <Select value={m.role} onChange={(e) => act(() => hiringApi.setRole(orgId, m.tenantId, e.target.value as OrgRole), "Role changed")} aria-label={`Role of ${m.name || m.email}`} className="w-40 sm:w-44">
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ORG_ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-[13px] text-ink-2">{ORG_ROLE_LABEL[m.role]}</span>
            )}
            {(canManage || m.tenantId === me) && !soleOwner && (
              <button
                type="button"
                onClick={() =>
                  act(async () => {
                    await hiringApi.removeMember(orgId, m.tenantId);
                    if (m.tenantId === me) onLeft();
                  }, m.tenantId === me ? "You left the workspace" : "Removed")
                }
                className="ml-auto min-h-10 text-[13px] font-medium text-ink-3 hover:text-danger-600 sm:ml-0"
              >
                {m.tenantId === me ? "Leave" : "Remove"}
              </button>
            )}
          </li>
          );
        })}
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
