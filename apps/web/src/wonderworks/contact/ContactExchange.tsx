"use client";
import { useState } from "react";
import { Lock, Mail, Phone } from "lucide-react";
import type { ContactOffer, ContactView } from "@/domain/contact/contact";
import { useCareerStore } from "@/store/career";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * Sharing phone and email in a conversation, the same in every module (owner, 2026-11-21: "safely share phone number
 * and email with masking option on by default and share only on mutual consent"). What you offer shows masked to the
 * other person until they offer theirs back; then both see each other's in full. Stop sharing takes yours back.
 * The module supplies the conversation's calls; the sheet shows exactly what goes, so Share is the confirmation.
 */
export function ContactExchange({ view, name, offer, withdraw }: { view: ContactView; name: string; offer: (o: ContactOffer) => Promise<ContactView>; withdraw: () => Promise<void> }) {
  const [v, setV] = useState(view);
  const [editing, setEditing] = useState(false);
  const first = name.split(" ")[0] || "They";
  const both = !!v.mine && !!v.theirs && !v.theirs.masked;
  const stop = async () => {
    try {
      await withdraw();
      setV({ mine: null, theirs: v.theirs ? { ...v.theirs, masked: true } : null });
      toast.success("You stopped sharing", `${first} no longer sees your contact details.`);
    } catch (e) {
      toast.error("Couldn't stop sharing", (e as Error).message);
    }
  };
  const line = (o: ContactOffer, full: boolean) => (
    <span className="flex flex-col gap-0.5 text-[13px]">
      {o.phone && (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          {full ? (
            <a href={`tel:${o.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-brand-600 hover:underline">
              {o.phone}
            </a>
          ) : (
            <span className="font-mono tracking-wide text-ink-2">{o.phone}</span>
          )}
        </span>
      )}
      {o.email && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Mail className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          {full ? (
            <a href={`mailto:${o.email}`} className="truncate font-medium text-brand-600 hover:underline">
              {o.email}
            </a>
          ) : (
            <span className="truncate text-ink-2">{o.email}</span>
          )}
        </span>
      )}
    </span>
  );
  return (
    <section aria-label="Contact details" className="mb-3 rounded-[16px] border border-line bg-surface p-3">
      <h2 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <Lock className="size-3.5 text-brand-600" aria-hidden /> Contact details
      </h2>
      {v.theirs && (
        <div className="mb-2">
          <p className="text-[11.5px] text-ink-3">{both ? `${first}'s` : `${first} offered (masked until you share yours)`}</p>
          {line(v.theirs, both)}
        </div>
      )}
      {v.mine ? (
        <div className="mb-1">
          <p className="text-[11.5px] text-ink-3">{both ? "Yours, shared with them" : `Yours: ${first} sees it masked until they share theirs`}</p>
          {line(v.mine, true)}
        </div>
      ) : (
        !v.theirs && <p className="mb-1 text-[12.5px] text-ink-3">Hidden on both sides. Whatever you offer shows masked until {first} shares theirs too.</p>
      )}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant={v.mine ? "outline" : "primary"} onClick={() => setEditing(true)}>
          {v.mine ? "Change" : v.theirs ? "Share mine to see theirs" : "Share my phone or email"}
        </Button>
        {v.mine && (
          <Button size="sm" variant="ghost" onClick={stop}>
            Stop sharing
          </Button>
        )}
      </div>
      {editing && (
        <OfferSheet
          name={first}
          start={v.mine}
          onClose={() => setEditing(false)}
          send={async (o) => {
            const next = await offer(o);
            setV(next);
            setEditing(false);
            toast.success("Shared", next.theirs && !next.theirs.masked ? `You and ${first} can now see each other's details.` : `${first} sees it masked until they share theirs.`);
          }}
        />
      )}
    </section>
  );
}

function OfferSheet({ name, start, onClose, send }: { name: string; start: ContactOffer | null; onClose: () => void; send: (o: ContactOffer) => Promise<void> }) {
  const own = useCareerStore((s) => s.dna.history?.contact);
  const [phone, setPhone] = useState(start?.phone ?? own?.phone ?? "");
  const [email, setEmail] = useState(start?.email ?? own?.email ?? "");
  const [withPhone, setWithPhone] = useState(start ? !!start.phone : !!own?.phone);
  const [withEmail, setWithEmail] = useState(start ? !!start.email : true);
  const [busy, setBusy] = useState(false);
  const o: ContactOffer = { ...(withPhone && phone.trim() ? { phone: phone.trim() } : {}), ...(withEmail && email.trim() ? { email: email.trim() } : {}) };
  return (
    <Modal
      open
      onClose={onClose}
      title="Share contact details"
      description={`${name} sees them masked until they share theirs. You can stop any time.`}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!o.phone && !o.email}
            onClick={async () => {
              setBusy(true);
              try {
                await send(o);
              } catch (e) {
                toast.error("Couldn't share", (e as Error).message);
                setBusy(false);
              }
            }}
          >
            Share
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <input type="checkbox" checked={withPhone} onChange={(e) => setWithPhone(e.target.checked)} className="size-4 accent-brand-600" /> Share my phone
        </label>
        {withPhone && (
          <Field label="Your phone number" htmlFor="cx-phone">
            <Input id="cx-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </Field>
        )}
        <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
          <input type="checkbox" checked={withEmail} onChange={(e) => setWithEmail(e.target.checked)} className="size-4 accent-brand-600" /> Share my email
        </label>
        {withEmail && (
          <Field label="Your email" htmlFor="cx-email">
            <Input id="cx-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
