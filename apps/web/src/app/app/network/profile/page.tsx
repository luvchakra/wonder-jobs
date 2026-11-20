"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TIERS, FIND_BY, NET_PARTS, NET_STATUSES, REQUESTS_FROM, TIERS, TIER_LABEL, networkProfileFrom, shortName, type FindBy, type NetPart, type NetStatus, type NetworkProfile, type RequestsFrom, type Tier } from "@/domain/network/network";
import { networkApi } from "@/services/network/client";
import { useCareerStore } from "@/store/career";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Select } from "@/components/common/Input";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { StatusChips } from "@/components/network/parts";

/**
 * Your network profile (owner, 2026-11-20): off until you turn it on, built from your Career Profile, with a choice for
 * each part of who sees it. People on the network see a change only when you press Update.
 */
export default function NetworkProfilePage() {
  const dna = useCareerStore((s) => s.dna);
  const router = useRouter();
  const [saved, setSaved] = useState<NetworkProfile | null | undefined>(undefined);
  const [tiers, setTiers] = useState<Record<NetPart, Tier>>(DEFAULT_TIERS);
  const [findBy, setFindBy] = useState<FindBy>("everyone");
  const [requestsFrom, setRequestsFrom] = useState<RequestsFrom>("everyone");
  const [statuses, setStatuses] = useState<NetStatus[]>([]);
  const [shareUpdates, setShareUpdates] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    networkApi
      .me()
      .then(({ profile: p }) => {
        setSaved(p);
        if (!p) return;
        setTiers(p.tiers);
        setFindBy(p.findBy);
        setRequestsFrom(p.requestsFrom);
        setStatuses(p.statuses);
        setShareUpdates(p.shareUpdates);
      })
      .catch((e) => {
        setFailed((e as Error).message);
        setSaved(null);
      });
  }, []);

  const base = useMemo(() => networkProfileFrom(dna), [dna]);
  const on = !!saved;

  const save = async () => {
    setBusy(true);
    try {
      const { profile } = await networkApi.save({ ...base, tiers, findBy, requestsFrom, statuses, shareUpdates });
      setSaved(profile);
      toast.success(on ? "Your network profile is updated" : "You're on the network", on ? undefined : "Find people under People and press Connect.");
      if (!on) router.replace("/app/network");
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    try {
      await networkApi.leave();
      setSaved(null);
      toast.info("You've left the network", "Nobody can find you or open your profile. Your connections come back if you rejoin.");
    } catch (e) {
      toast.error("Couldn't leave", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (saved === undefined) return <PageLoading />;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My network profile" back={{ href: "/app/network", label: "My network" }} description="What other people on WonderWorks see of you, and who can find you." />
      {failed && <p className="mb-3 rounded-[12px] border border-line bg-surface p-3 text-[13px] text-danger-600">{failed}</p>}

      <Card className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">What people see</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={base.name || "You"} size={56} self={tiers.photo !== "hidden"} />
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold text-ink">{base.name || "Add your name to your Career Profile"}</p>
            <p className="line-clamp-2 break-words text-[13px] text-ink-2">{base.headline || "No headline yet"}</p>
            {base.location && <p className="text-[12px] text-ink-3">{base.location}</p>}
          </div>
        </div>
        <StatusChips statuses={statuses} className="mt-2.5" />
        <p className="mt-3 text-[12px] text-ink-3">
          {[`${base.skills.length} skills`, `${base.experience.length} roles`, `${base.education.length} schools`, base.about ? "an About" : ""].filter(Boolean).join(" · ")}, from your{" "}
          <Link href="/app/career-dna" className="font-medium text-brand-600 hover:underline">
            Career Profile
          </Link>
          . Change them there, then press {on ? "Update" : "Join"}. Your email and phone are never shown.
        </p>
        {on && (
          <p className="mt-2 text-[12px] text-ink-3">
            On the network · updated {relativeTime(saved.updatedAt)} ·{" "}
            <Link href={`/app/network/${saved.publicId}`} className="font-medium text-brand-600 hover:underline">
              See my profile
            </Link>
          </p>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="text-[14px] font-semibold text-ink">Who can find you</h2>
        <div className="mt-1 flex flex-col divide-y divide-line">
          {FIND_BY.map((o) => (
            <label key={o.id} className="flex min-h-12 items-center gap-3 py-2 text-[13.5px] text-ink">
              <input type="radio" name="find" checked={findBy === o.id} onChange={() => setFindBy(o.id)} className="size-4 accent-brand-600" />
              <span>
                {o.label}
                <span className="block text-[11.5px] text-ink-3">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="text-[14px] font-semibold text-ink">Who sees each part</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-3">Everyone means people on the network who can find you. Without your full name, people see {shortName(base.name || "First Last")}.</p>
        <div className="mt-1 flex flex-col divide-y divide-line">
          {NET_PARTS.map((p) => (
            <label key={p.id} className="flex min-h-12 items-center justify-between gap-3 py-1.5 text-[13.5px] text-ink">
              {p.label}
              <Select value={tiers[p.id]} onChange={(e) => setTiers((t) => ({ ...t, [p.id]: e.target.value as Tier }))} aria-label={`${p.label}: who sees it`} className="h-9 w-auto min-w-0">
                {TIERS.filter((t) => p.id !== "name" || t !== "hidden").map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABEL[t]}
                  </option>
                ))}
              </Select>
            </label>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="text-[14px] font-semibold text-ink">Requests and updates</h2>
        <label className="mt-1 flex min-h-12 items-center justify-between gap-3 text-[13.5px] text-ink">
          Who can ask to connect
          <Select value={requestsFrom} onChange={(e) => setRequestsFrom(e.target.value as RequestsFrom)} className="h-9 w-auto min-w-0">
            {REQUESTS_FROM.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>
        <p className="mb-1 mt-2 text-[12px] font-medium text-ink-2">Show on my profile</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {NET_STATUSES.map((s) => (
            <label key={s.id} className="flex min-h-10 items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={statuses.includes(s.id)} onChange={(e) => setStatuses((x) => (e.target.checked ? [...x, s.id] : x.filter((y) => y !== s.id)))} className="size-4 accent-brand-600" />
              {s.label}
            </label>
          ))}
        </div>
        <label className="mt-1 flex min-h-10 items-center gap-2 border-t border-line pt-2 text-[13.5px] text-ink">
          <input type="checkbox" checked={shareUpdates} onChange={(e) => setShareUpdates(e.target.checked)} className="size-4 accent-brand-600" />
          Tell my connections when I start a new role or turn one of these on
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={busy} disabled={!base.name}>
          {on ? "Update my network profile" : "Join the network"}
        </Button>
        {on && (
          <button type="button" onClick={leave} disabled={busy} className="min-h-10 text-[13px] font-medium text-ink-3 hover:text-ink">
            Leave the network
          </button>
        )}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">Only people on the network can see each other. Anyone you block can&apos;t find you, and isn&apos;t told.</p>
    </div>
  );
}
