"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { AccountMenuConfig, AccountMenuItemId } from "@/domain/navigation/accountMenu";
import { Button } from "@/components/common/Button";
import { Switch } from "@/components/common/Input";
import { LoadError, Loading, Note, PageTitle, Panel, adminFetch, useAdmin } from "@/components/jobslake/ui";
import { relativeTime } from "@/lib/format";

type Data = { menu: AccountMenuConfig; items: readonly { id: AccountMenuItemId; label: string }[]; alwaysShown: AccountMenuItemId[]; defaults: AccountMenuConfig };

/** The account menu every user sees (the avatar's menu, the phone's ••• button): its order and what's shown. */
export default function AccountMenuPage() {
  const { data, error, reload } = useAdmin<Data>("account-menu");
  return (
    <>
      <PageTitle title="Account menu" subtitle="The order and items every user sees in their account menu. Account and Sign out are always there; Admin shows only to admins, last." />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <Editor key={data.menu.updatedAt ?? "default"} data={data} onSaved={reload} />}
    </>
  );
}

function Editor({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const [order, setOrder] = useState(data.menu.order);
  const [hidden, setHidden] = useState(new Set(data.menu.hidden));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = (id: AccountMenuItemId) => data.items.find((i) => i.id === id)?.label ?? id;
  const changed = order.join() !== data.menu.order.join() || [...hidden].sort().join() !== [...data.menu.hidden].sort().join();
  const isDefault = order.join() === data.defaults.order.join() && hidden.size === 0;
  const move = (i: number, by: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await adminFetch<{ menu: AccountMenuConfig }>("account-menu", { method: "PUT", body: JSON.stringify({ order, hidden: [...hidden] }) });
    setBusy(false);
    if (!r.ok) return setProblem(r.error.message);
    onSaved();
  };
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Panel title="Items, in order">
        <ol aria-label="Account menu items" className="divide-y divide-line">
          {order.map((id, i) => {
            const locked = data.alwaysShown.includes(id);
            return (
              <li key={id} className="flex min-h-12 items-center gap-2 py-1.5 text-[14px]">
                <span className={hidden.has(id) ? "flex-1 text-ink-4 line-through" : "flex-1 text-ink"}>{label(id)}</span>
                <label className="inline-flex items-center gap-2 text-[12px] text-ink-3">
                  {locked ? "Always shown" : hidden.has(id) ? "Hidden" : "Shown"}
                  <Switch
                    checked={!hidden.has(id)}
                    disabled={locked}
                    onChange={(on) =>
                      setHidden((h) => {
                        const next = new Set(h);
                        if (on) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    label={`Show ${label(id)}`}
                  />
                </label>
                <button type="button" aria-label={`Move ${label(id)} up`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink disabled:opacity-30">
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Move ${label(id)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink disabled:opacity-30">
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
        {problem && (
          <p role="alert" className="mt-3 text-[13px] text-danger-600">
            {problem}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" loading={busy} disabled={!changed} onClick={() => void save()}>
            Save for everyone
          </Button>
          {!isDefault && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOrder(data.defaults.order);
                setHidden(new Set());
              }}
            >
              Back to default
            </Button>
          )}
        </div>
      </Panel>
      <Note>
        Users see a change within a minute.{data.menu.updatedAt ? ` Last saved ${relativeTime(data.menu.updatedAt)}${data.menu.updatedBy ? ` by ${data.menu.updatedBy}` : ""}.` : " Nothing saved yet: users see the default."}
      </Note>
    </div>
  );
}
