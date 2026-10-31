"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge, type Tone } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Select, Textarea } from "@/components/common/Input";
import { EmptyState, ErrorState, PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Act } from "@/wonderworks/pipeline/Act";
import { CATEGORIES, CONDITIONS, MAX_PHOTOS, priceLabel, type Condition, type ListingState, type MarketListing } from "../domain";
import { photoSrc } from "../manifest";
import { ScamWarning } from "./ScamWarning";

type Mine = MarketListing & { state: ListingState };
const BACK = { href: "/app/m/marketplace/you", label: "You" };
const SETTINGS = { href: "/app/m/marketplace/you/profile#settings", label: "Buy, Sell & Rent → You" };
const STATE: Record<ListingState, { label: string; tone: Tone }> = { draft: { label: "Draft", tone: "neutral" }, open: { label: "Live", tone: "success" }, sold: { label: "Sold", tone: "brand" }, hidden: { label: "Hidden after reports", tone: "danger" }, closed: { label: "Closed", tone: "neutral" } };
const url = (id: string) => `/api/m/marketplace/listings/${encodeURIComponent(id)}`;

/**
 * My listings, the selling side (Deals' "My listings" section): your items by state, a form to add one, photos, and Publish
 * (your own press; a listing is a draft and invisible until then). Prohibited items, contact details in the text and more than
 * three new listings a day are refused by the server, which says why. Rentals aren't open yet.
 */
export function MarketplaceCompany() {
  const [list, setList] = useState<Mine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Mine | "new" | null>(null);
  const load = () =>
    call<{ listings: Mine[] }>("/api/m/marketplace/listings")
      .then((r) => setList(r.listings))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (error) return <ErrorState title="Couldn't load your listings" body={error} actions={[{ label: "Try again", onClick: () => (setError(null), void load()) }]} />;
  if (!list) return <PageLoading rows={3} />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My listings" back={BACK} description="Things you're selling. Buyers message you here; you share contact details yourself, when you're ready." />
      <ScamWarning className="mb-3" />
      {editing ? (
        <Editor
          key={editing === "new" ? "new" : editing.listingId}
          initial={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : (
        <>
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")}>
            Sell something
          </Button>
          {list.length === 0 ? (
            <EmptyState title="Nothing listed" body="Add an item with a few photos. It goes live only when you press Publish." />
          ) : (
            <ul className="mt-3 flex flex-col gap-2" aria-label="My listings">
              {list.map((l) => (
                <li key={l.listingId} className="wj-card flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink">{l.title}</p>
                      <p className="text-[13px] text-ink-3">{priceLabel(l.terms.price)} · {l.terms.condition} · {l.area} · {l.terms.photos.length} photo{l.terms.photos.length === 1 ? "" : "s"}</p>
                    </div>
                    <Badge tone={STATE[l.state].tone}>{STATE[l.state].label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(l.state === "draft" || l.state === "open" || l.state === "closed") && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                        Edit
                      </Button>
                    )}
                    {(l.state === "draft" || l.state === "closed") && <Act capability="marketplace.publish" label="Publish" size="sm" settings={SETTINGS} review={<>“{l.title}” goes into Find at {priceLabel(l.terms.price)}, with your first name and area. Contact details stay private.</>} run={async (confirmed) => (await call(url(l.listingId), { method: "PATCH", body: { action: "publish", confirmed } }), void load())} done="Published" />}
                    {l.state === "open" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => call(url(l.listingId), { method: "PATCH", body: { action: "state", state: "closed" } }).then(() => load()).catch((e: Error) => toast.error("Couldn't do that", e.message))}>
                          Take down
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Editor({ initial, onDone }: { initial: Mine | null; onDone: () => void }) {
  const [id, setId] = useState(initial?.listingId ?? null);
  const [photos, setPhotos] = useState<string[]>(initial?.terms.photos ?? []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<string>(initial?.terms.category ?? "");
  const [condition, setCondition] = useState<Condition | "">(initial?.terms.condition ?? "");
  const [price, setPrice] = useState(initial ? String(initial.terms.price) : "");
  const [negotiable, setNegotiable] = useState(initial?.terms.negotiable ?? false);
  const [area, setArea] = useState(initial?.area ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const listing = { title, description, category, price: Number(price), negotiable, condition, area };
      const out = id ? await call<Mine>(url(id), { method: "PATCH", body: { action: "edit", listing } }) : await call<Mine>("/api/m/marketplace/listings", { body: listing });
      setId(out.listingId);
      toast.success("Saved", "Add photos, then publish when it's ready.");
      return out.listingId;
    } catch (e) {
      toast.error("Check the listing", (e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const lid = id ?? (await save());
    if (!lid) return;
    for (const f of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`${url(lid)}/photos`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) return void toast.error("Couldn't add the photo", data.error ?? "Try another.");
      setPhotos((p) => [...p, data.id!]);
    }
  };
  return (
    <form
      className="wj-card space-y-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save()) onDone();
      }}
    >
      <Field label="Title" htmlFor="mk-title">
        <Input id="mk-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Study table, solid wood" />
      </Field>
      <Field label="Description" htmlFor="mk-desc" hint="Condition, size, age, why you're selling. No phone numbers, emails or links.">
        <Textarea id="mk-desc" rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Category" htmlFor="mk-cat">
        <Select id="mk-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Choose</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Condition">
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Price (₹)" htmlFor="mk-price">
        <Input id="mk-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))} />
      </Field>
      <label className="flex items-center gap-2 text-[14px] text-ink-2">
        <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} /> Open to offers
      </label>
      <Field label="Area" htmlFor="mk-area2" hint="Where buyers can see it, e.g. Indiranagar, Bengaluru">
        <Input id="mk-area2" value={area} maxLength={80} onChange={(e) => setArea(e.target.value)} />
      </Field>
      <Field label={`Photos (${photos.length} of ${MAX_PHOTOS})`} hint="JPEG, PNG or WebP, up to 5 MB each. Location data is removed. At least one is needed to publish.">
        <div className="flex flex-wrap gap-2">
          {id &&
            photos.map((p) => (
              <span key={p} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc(id, p)} alt="" width={72} height={72} className="size-[72px] rounded-[10px] border border-line object-cover" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink text-white"
                  onClick={() => call(`${url(id)}/photos/${encodeURIComponent(p)}`, { method: "DELETE" }).then(() => setPhotos((x) => x.filter((y) => y !== p))).catch((e: Error) => toast.error("Couldn't remove it", e.message))}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          {photos.length < MAX_PHOTOS && (
            <label className="grid size-[72px] cursor-pointer place-items-center rounded-[10px] border border-dashed border-line-strong text-ink-3 hover:bg-bg-soft">
              <Plus className="size-5" aria-hidden />
              <span className="sr-only">Add photos</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
            </label>
          )}
        </div>
      </Field>
      <p className="text-[12px] text-ink-4">Rentals aren&apos;t open yet. Weapons, drugs, stolen goods, live animals and similar items aren&apos;t allowed.</p>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} full>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </form>
  );
}
