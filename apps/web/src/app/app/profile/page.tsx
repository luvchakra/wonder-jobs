"use client";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { DigestEmailCard } from "@/components/account/DigestEmailCard";
import { PushNotifications } from "@/components/pwa/PushNotifications";
import { PlanCard } from "@/components/billing/PlanCard";
import { YourDataCard } from "@/components/privacy/YourDataCard";
import { useBillingStore } from "@/store/billing";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { PageLoading } from "@/components/common/States";
import { flushRemote, syncStatus } from "@/store/remoteStorage";
import { useAuthStore } from "@/store/auth";
import { signOutEverywhere } from "@/lib/auth/browser";
import { Cloud, CloudOff, FlaskConical } from "lucide-react";


function CloudSyncCard() {
  // "error" is distinct from a confirmed "local" backend: a failed request tells us nothing about how
  // this deployment is actually configured, so it must never be asserted as a fact about data storage.
  const [backend, setBackend] = useState<"supabase" | "local" | "unknown" | "error">("unknown");
  const sync = useSyncExternalStore(syncStatus.subscribe, syncStatus.get, () => "idle" as const);
  const mode = useAuthStore((s) => s.mode);
  useEffect(() => {
    if (mode === "demo") return;
    fetch("/api/state/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { backend: "supabase" | "local" }) => setBackend(d.backend))
      .catch(() => setBackend("error"));
  }, [mode]);
  if (mode === "demo") {
    return (
      <Card className="mt-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-600">
          <FlaskConical className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">Demo mode</p>
          <p className="text-[12px] text-ink-3">This is sample data kept on this device only. Create an account to run Wonder on your own career and keep everything synced.</p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" href="/sign-up">
              Create account
            </Button>
            <Button size="sm" variant="outline" href="/demo/exit?next=/sign-in">
              Exit demo
            </Button>
          </div>
        </div>
      </Card>
    );
  }
  const cloud = backend === "supabase";
  return (
    <Card className="mt-4 flex items-start gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${cloud ? "bg-success-100 text-success-600" : "bg-bg-soft text-ink-3"}`}>{cloud ? <Cloud className="size-5" aria-hidden /> : <CloudOff className="size-5" aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{backend === "unknown" ? "Checking sync…" : backend === "error" ? "Couldn't check sync status" : cloud ? "Synced to the cloud" : "Stored on this device only"}</p>
        <p className="text-[12px] text-ink-3">
          {backend === "error"
            ? "We couldn't reach the server to check. This doesn't mean anything is wrong — refresh the page to check again."
            : cloud
              ? `Your Career Profile, applications, runs and settings are saved to your account${sync === "syncing" ? " · saving…" : sync === "local" ? " · last save didn't reach the server, retrying on next change" : ""}.`
              : "Persistence isn't configured on this deployment yet, so data lives in this browser. Provider keys are held in memory only."}
        </p>
      </div>
    </Card>
  );
}

/**
 * Opens at the section the avatar menu linked to (#plan, #notifications, #your-data). Those cards load
 * their own data first, so wait briefly for the target to appear, then scroll it clear of the top bar.
 */
function useSectionScroll() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const go = () => {
      clearInterval(timer);
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      let tries = 0;
      timer = setInterval(() => {
        const el = document.getElementById(id);
        if (!el && ++tries < 30) return;
        clearInterval(timer);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
      }, 100);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", go);
    };
  }, []);
}

function ProfileInner() {
  const params = useSearchParams();
  const dna = useCareerStore((s) => s.dna);
  const config = useAIStore((s) => s.config);
  const email = useAuthStore((s) => s.email);
  const userId = useAuthStore((s) => s.userId);
  const mode = useAuthStore((s) => s.mode);
  const billingReturn = params.get("billing") ?? (params.get("upgrade") === "1" ? "upgrade" : null);
  const plan = useBillingStore((st) => st.data?.plan ?? "free");
  const displayName = dna.name || email?.split("@")[0] || "You";
  useSectionScroll();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" />
      <Card className="flex items-center gap-4">
        <Avatar name={displayName} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">{displayName}</p>
          <p className="truncate text-[13px] text-ink-3">{dna.headline || email || (mode === "demo" ? "Sample candidate" : "")}</p>
          <div className="mt-1 flex gap-2">
            <Badge tone={plan === "pro" ? "brand" : "neutral"}>{plan === "pro" ? "Pro" : "Free plan"}</Badge>
            <Badge>{AI_PROVIDERS[config.activeProvider].name}</Badge>
          </div>
        </div>
      </Card>
      <CloudSyncCard />
      <div id="notifications" className="scroll-mt-20">
        <PushNotifications />
        <DigestEmailCard />
      </div>
      <PlanCard returnState={billingReturn} />
      <YourDataCard />
      <Card padding="none" className="mt-4">
        <ul className="divide-y divide-line">
          <li>
            {mode === "demo" ? (
              <a href="/demo/exit?next=/sign-in" className="flex items-center gap-3 px-4 py-3.5 text-[14px] text-ink hover:bg-surface-2">
                <LogOut className="size-4 text-ink-3" aria-hidden />
                <span className="flex-1">Exit demo</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  // Send any still-debounced write (e.g. just-completed onboarding) while the session is
                  // still valid — signOutEverywhere wipes this account's local copy immediately after, so
                  // anything not yet on the server by then never arrives.
                  await flushRemote(false);
                  await signOutEverywhere(userId);
                  // Full reload on purpose: drops every in-memory store before another account can sign in.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/";
                }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] text-ink hover:bg-surface-2"
              >
                <LogOut className="size-4 text-ink-3" aria-hidden />
                <span className="flex-1">Sign out</span>
              </button>
            )}
          </li>
        </ul>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ProfileInner />
    </Suspense>
  );
}
