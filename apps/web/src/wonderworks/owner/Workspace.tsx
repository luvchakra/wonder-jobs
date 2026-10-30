"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Select } from "@/components/common/Input";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { Tabs } from "@/components/common/Tabs";
import { can, type OrgPermission } from "@/domain/org/permissions";
import { ORG_ROLE_LABEL, type OrgRole } from "@/domain/org/types";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { call } from "@/wonderworks/api";

export type Workspace = { org: { id: string; name: string }; role: OrgRole };

/**
 * The hiring workspaces the caller belongs to (Hiring's own list), the one picked (`?org=`, else the first) and the
 * caller's role in it. Every module's owner side starts here; the server checks the role again on every action.
 */
export function useWorkspaces() {
  const params = useSearchParams();
  const [spaces, setSpaces] = useState<Workspace[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(params.get("org"));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<{ workspaces: Workspace[] }>("/api/hiring")
      .then((r) => setSpaces(r.workspaces.filter((w) => can(w.role, "jobs.view"))))
      .catch((e: Error) => setError(e.message));
  }, []);
  const ws = spaces?.find((w) => w.org.id === orgId) ?? spaces?.[0] ?? null;
  return { spaces, ws, setOrgId, error, may: (p: OrgPermission) => can(ws?.role, p) };
}

/**
 * A module's owner side in Hiring's own layout (docs/WONDERWORKS_PLATFORM.md §6, "Owner side"): the workspace's name and
 * your role, back to Hiring, the workspace picker, and underline tabs; or why there's nothing to show yet.
 */
export function OwnerWorkspace<T extends string>({
  module,
  intro,
  noWorkspace,
  state: { spaces, ws, setOrgId, error },
  loaded,
  tabs,
  tab,
  onTab,
  children,
}: {
  /** "Internships", "Teaching". */
  module: string;
  /** What the owner side is for, shown before there's a workspace. */
  intro: string;
  /** What to do with no workspace yet: "Create one for your company in Hiring, then post internships here." */
  noWorkspace: string;
  state: Pick<ReturnType<typeof useWorkspaces>, "spaces" | "ws" | "setOrgId" | "error">;
  /** The module's own data for the workspace has loaded. */
  loaded: boolean;
  tabs: { value: T; label: string }[];
  tab: T;
  onTab: (t: T) => void;
  children: React.ReactNode;
}) {
  if (error) return <ErrorState title="Couldn't load your workspace" body={error} />;
  if (!spaces) return <PageLoading rows={3} />;
  if (!ws)
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={module} description={intro} back={{ href: "/app/hiring", label: "Hiring" }} />
        <EmptyState icon={<Building2 className="size-5" aria-hidden />} title="No hiring workspace yet" body={noWorkspace} action={{ label: "Open Hiring", href: "/app/hiring" }} />
      </div>
    );
  if (!loaded) return <PageLoading rows={3} />;
  const role = ORG_ROLE_LABEL[ws.role];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={ws.org.name}
        description={`${module} · you're ${role === "Owner" ? "an Owner" : `a ${role}`}`}
        back={{ href: `/app/hiring?org=${encodeURIComponent(ws.org.id)}`, label: "Hiring" }}
        actions={
          spaces.length > 1 && (
            <Select value={ws.org.id} onChange={(e) => setOrgId(e.target.value)} aria-label="Workspace" className="w-40 sm:w-44">
              {spaces.map((w) => (
                <option key={w.org.id} value={w.org.id}>
                  {w.org.name}
                </option>
              ))}
            </Select>
          )
        }
      />
      <Tabs value={tab} onChange={onTab} items={tabs} label={`${module} workspace`} variant="underline" className="mb-4" />
      {children}
    </div>
  );
}
