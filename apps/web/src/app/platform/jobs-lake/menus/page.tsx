"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { MenuConfig, MenuId } from "@/domain/navigation/menus";
import { Button } from "@/components/common/Button";
import { Switch } from "@/components/common/Input";
import { LoadError, Loading, Note, PageTitle, Panel, adminFetch, useAdmin } from "@/components/jobslake/ui";
import { relativeTime } from "@/lib/format";

type Menu = { id: MenuId; title: string; where: string; items: readonly { id: string; label: string }[]; alwaysShown: readonly string[]; config: MenuConfig; defaults: MenuConfig };

/** The menus every user sees that an admin arranges: their order and which items are shown. */
export default function MenusPage() {
  const { data, error, reload } = useAdmin<{ menus: Menu[] }>("menus");
  return (
    <>
      <PageTitle title="App menus" subtitle="The menus every person sees, in every module: the module menu, the account menu, and Jobs' You page. Saving applies to everyone within a minute." />
      <LandingSwitch />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <div className="flex max-w-xl flex-col gap-4">
          {data.menus.map((m) => (
            <Editor key={`${m.id}:${m.config.updatedAt ?? "default"}`} menu={m} onSaved={reload} />
          ))}
        </div>
      )}
    </>
  );
}

function Editor({ menu, onSaved }: { menu: Menu; onSaved: () => void }) {
  const [order, setOrder] = useState<string[]>(menu.config.order);
  const [hidden, setHidden] = useState(new Set<string>(menu.config.hidden));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = (id: string) => menu.items.find((i) => i.id === id)?.label ?? id;
  const changed = order.join() !== menu.config.order.join() || [...hidden].sort().join() !== [...menu.config.hidden].sort().join();
  const isDefault = order.join() === menu.defaults.order.join() && hidden.size === 0;
  const move = (i: number, by: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await adminFetch<{ config: MenuConfig }>("menus", { method: "PUT", body: JSON.stringify({ menu: menu.id, order, hidden: [...hidden] }) });
    setBusy(false);
    if (!r.ok) return setProblem(r.error.message);
    onSaved();
  };
  return (
    <Panel title={menu.title}>
      <p className="mb-2 text-[12px] text-ink-3">{menu.where}</p>
      <ol aria-label={`${menu.title} items`} className="divide-y divide-line">
        {order.map((id, i) => {
          const locked = menu.alwaysShown.includes(id);
          return (
            <li key={id} className="flex min-h-12 items-center gap-2 py-1.5 text-[14px]">
              <span className={hidden.has(id) ? "flex-1 text-ink-4 line-through" : "flex-1 text-ink"}>{label(id)}</span>
              <span className="text-[12px] text-ink-3">{locked ? "Always shown" : hidden.has(id) ? "Hidden" : "Shown"}</span>
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
              setOrder(menu.defaults.order);
              setHidden(new Set());
            }}
          >
            Back to default
          </Button>
        )}
      </div>
      <div className="mt-3">
        <Note>{menu.config.updatedAt ? `Last saved ${relativeTime(menu.config.updatedAt)}${menu.config.updatedBy ? ` by ${menu.config.updatedBy}` : ""}.` : "Nothing saved yet: users see the default."}</Note>
      </div>
    </Panel>
  );
}

/**
 * Which landing page the public sees at / (owner, 2026-11-07: "keep the current landing page as backup that i can
 * activate later"): the quiet one-page version, or the full one with the kinds, how it works, pricing and contact.
 */
function LandingSwitch() {
  const { data, error, reload } = useAdmin<{ page: "quiet" | "full" }>("landing");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pick = async (page: "quiet" | "full") => {
    setBusy(true);
    setMsg(null);
    const r = await adminFetch<{ page: string }>("landing", { method: "PUT", body: JSON.stringify({ page }) });
    setBusy(false);
    setMsg(r.ok ? "Saved. The home page shows it now." : r.error.message);
    reload();
  };
  return (
    <Panel title="Landing page" className="mb-4 max-w-xl">
      {error && <LoadError error={error} onRetry={reload} />}
      {data && (
        <div className="flex flex-col gap-2 text-[13.5px]">
          {([
            ["quiet", "Quiet", "One page: a few lines on what WonderWorks does for you, and Get started. No pricing."],
            ["full", "Full", "The earlier page: the eight kinds, how it works, pricing and the contact form."],
          ] as const).map(([id, label, hint]) => (
            <label key={id} className="flex cursor-pointer items-start gap-2.5">
              <input type="radio" name="landing" className="mt-1" checked={data.page === id} disabled={busy} onChange={() => void pick(id)} />
              <span>
                <span className="font-medium text-ink">{label}</span>
                <span className="block text-[12.5px] text-ink-3">{hint}</span>
              </span>
            </label>
          ))}
          {msg && <p className="text-[12.5px] text-ink-3">{msg}</p>}
        </div>
      )}
    </Panel>
  );
}
