"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import type { PortalConnection } from "@/domain/connections/types";
import { relativeTime } from "@/lib/format";
import { connectionsApi } from "@/services/connections/client";
import { useAuthStore } from "@/store/auth";

const STATUS: Record<PortalConnection["status"], string> = { active: "Works", needs_verification: "Verify your email", failed: "Didn't sign in last time" };

/**
 * Account → Sign-in connections (WJ-316): the job-portal accounts Wonder may sign in with during Apply for this job
 * — ones you added, and ones Wonder created for you. Passwords are stored encrypted and never shown again.
 */
export function ConnectionsCard() {
  const mode = useAuthStore((s) => s.mode);
  const [list, setList] = useState<PortalConnection[] | null>(null);
  const [form, setForm] = useState({ host: "", email: "", password: "" });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => connectionsApi.list().then(setList).catch(() => setList(null)), []);
  useEffect(() => {
    if (mode === "user") void load();
  }, [mode, load]);
  if (mode !== "user") return null;

  const add = async () => {
    setBusy("add");
    try {
      await connectionsApi.save(form);
      setForm({ host: "", email: "", password: "" });
      toast.success("Sign-in saved");
      await load();
    } catch (e) {
      toast.error("Couldn't save it", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  const remove = async (c: PortalConnection) => {
    setBusy(c.id);
    try {
      await connectionsApi.remove(c.id);
      await load();
    } catch (e) {
      toast.error("Couldn't remove it", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div id="connections" className="mt-4 scroll-mt-20">
      <Fold title="Sign-in connections" hint={list?.length ? `${list.length} job portal${list.length === 1 ? "" : "s"}` : "Job portals Wonder can sign in to for you"}>
        <div className="flex flex-col gap-4 text-[13px]">
          {list === null && <p className="text-ink-3">Your connections can&apos;t be read just now.</p>}
          {list?.length === 0 && <p className="text-ink-3">None yet. When an application asks you to sign in, Wonder can create the account for you or use one you add here.</p>}
          {!!list?.length && (
            <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
              {list.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{c.host}</p>
                    <p className="truncate text-[12px] text-ink-3">
                      {c.email} · {c.masked} · {c.createdBy === "wonder" ? "Created by Wonder" : "Added by you"} · {STATUS[c.status]}
                      {c.lastUsedAt ? ` · used ${relativeTime(c.lastUsedAt)}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void remove(c)} loading={busy === c.id}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Fold title="Add a sign-in" hint="An account you already have">
            <div className="flex flex-col gap-3">
              <Field label="Portal address" htmlFor="pc-host" hint="e.g. amgen.wd1.myworkdayjobs.com">
                <Input id="pc-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Email" htmlFor="pc-email">
                <Input id="pc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
              </Field>
              <Field label="Password" htmlFor="pc-pw" hint="Stored encrypted; never shown again.">
                <Input id="pc-pw" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              </Field>
              <Button size="sm" className="self-start" onClick={() => void add()} loading={busy === "add"} disabled={!form.host || !form.email || form.password.length < 6}>
                Save sign-in
              </Button>
            </div>
          </Fold>
        </div>
      </Fold>
    </div>
  );
}
