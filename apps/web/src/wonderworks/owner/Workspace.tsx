"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, Input, Select } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import {
  ErrorState,
  PageLoading,
} from "@/components/common/States";
import { Tabs } from "@/components/common/Tabs";
import { can, type OrgPermission } from "@/domain/org/permissions";
import { ORG_ROLE_LABEL_NEUTRAL, type OrgRole } from "@/domain/org/types";
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
  const reload = useCallback(() => {
    call<{ workspaces: Workspace[] }>("/api/hiring")
      .then((r) =>
        setSpaces(r.workspaces.filter((w) => can(w.role, "jobs.view"))),
      )
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const ws = spaces?.find((w) => w.org.id === orgId) ?? spaces?.[0] ?? null;
  return {
    spaces,
    ws,
    setOrgId,
    reload,
    error,
    may: (p: OrgPermission) => can(ws?.role, p),
  };
}

/**
 * A module's owner side (docs/WONDERWORKS_PLATFORM.md §6, "Owner side"): the organisation's name and your role, back to
 * the module's You, the organisation picker, and underline tabs. With no organisation yet, it's set up right here
 * (owner, 2026-11-03: a scholarship page asked for a "hiring workspace"): every module shares one organisation, and its
 * team is managed under Team & settings.
 */
export function OwnerWorkspace<T extends string>({
  module,
  intro,
  noWorkspace,
  state: { spaces, ws, setOrgId, error, reload },
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
  /** Who sets one up, in the module's words: "Set up your company to post internships." */
  noWorkspace: string;
  state: Pick<
    ReturnType<typeof useWorkspaces>,
    "spaces" | "ws" | "setOrgId" | "error"
  > & { reload?: () => void };
  /** The module's own data for the workspace has loaded. */
  loaded: boolean;
  tabs: { value: T; label: string }[];
  tab: T;
  onTab: (t: T) => void;
  children: React.ReactNode;
}) {
  // Back to the module's own You (this page is /app/m/<module>/company).
  const pathname = usePathname();
  const back = { href: pathname.replace(/\/company$/, "/you"), label: "You" };
  if (error)
    return <ErrorState title="Couldn't load your workspace" body={error} />;
  if (!spaces) return <PageLoading rows={3} />;
  if (!ws)
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={module} description={intro} back={back} />
        <NewOrganisation
          body={noWorkspace}
          onCreated={(id) => (setOrgId(id), reload?.())}
        />
      </div>
    );
  if (!loaded) return <PageLoading rows={3} />;
  const role = ORG_ROLE_LABEL_NEUTRAL[ws.role];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={ws.org.name}
        description={`${module} · you're ${role === "Owner" ? "an Owner" : `a ${role}`}`}
        back={back}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/app/hiring?org=${encodeURIComponent(ws.org.id)}&tab=team&from=${encodeURIComponent(pathname)}`}
              className="text-[13px] font-medium text-brand-600 hover:underline"
            >
              Team &amp; settings
            </Link>
            {spaces.length > 1 && (
              <Select
                value={ws.org.id}
                onChange={(e) => setOrgId(e.target.value)}
                aria-label="Workspace"
                className="w-40 sm:w-44"
              >
                {spaces.map((w) => (
                  <option key={w.org.id} value={w.org.id}>
                    {w.org.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />
      <Tabs
        value={tab}
        onChange={onTab}
        items={tabs}
        label={`${module} workspace`}
        variant="underline"
        className="mb-4"
      />
      {children}
    </div>
  );
}

/** The first organisation, set up here (the same one every module and Hiring use): a name and, optionally, a website. */
function NewOrganisation({
  body,
  onCreated,
}: {
  body: string;
  onCreated: (orgId: string) => void;
}) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="mx-auto max-w-md">
      <div className="mb-3 flex items-center gap-2">
        <Building2 className="size-5 text-brand-600" aria-hidden />
        <h2 className="text-[16px] font-semibold text-ink">
          Set up your organisation
        </h2>
      </div>
      <p className="mb-4 text-[13px] text-ink-3">
        {body} You become its Owner and can invite your team later.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const w = await call<Workspace>("/api/hiring", {
              body: { name: name.trim(), website: website.trim() || undefined },
            });
            toast.success(`${w.org.name} is set up`);
            onCreated(w.org.id);
          } catch (err) {
            toast.error("Couldn't set it up", (err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name" htmlFor="org-name" required>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label="Website (optional)" htmlFor="org-site">
          <Input
            id="org-site"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.org"
            maxLength={300}
          />
        </Field>
        <Button type="submit" loading={busy} disabled={name.trim().length < 2}>
          Set up
        </Button>
      </form>
    </Card>
  );
}
