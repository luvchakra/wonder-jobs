"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { PlanCard } from "@/components/billing/PlanCard";
import { planBadgeLabel } from "@/domain/billing/plans";
import { YourDataCard } from "@/components/privacy/YourDataCard";
import { JobsLakeApiCard } from "@/components/account/JobsLakeApiCard";
import { useBillingStore } from "@/store/billing";
import { ProfilePhoto } from "@/components/account/ProfilePhoto";
import { Badge } from "@/components/common/Badge";
import { PageLoading } from "@/components/common/States";
import { useAuthStore } from "@/store/auth";

/**
 * Opens at the section the avatar menu linked to (#plan, #your-data, #jobslake-api). Those cards load
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
  const mode = useAuthStore((s) => s.mode);
  const billingReturn = params.get("billing") ?? (params.get("upgrade") === "1" ? "upgrade" : null);
  // Until billing has loaded the plan is unknown — nothing is shown rather than "Free plan".
  const billing = useBillingStore((st) => st.data);
  const displayName = dna.name || email?.split("@")[0] || "You";
  useSectionScroll();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" />
      <Card className="flex items-center gap-4">
        <ProfilePhoto name={displayName} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">{displayName}</p>
          <p className="truncate text-[13px] text-ink-3">{dna.headline || email || (mode === "demo" ? "Sample candidate" : "")}</p>
          <div className="mt-1 flex gap-2">
            {billing && <Badge tone={billing.plan === "free" ? "neutral" : "brand"}>{planBadgeLabel(billing.plan, billing.plans)}</Badge>}
            <Badge>{AI_PROVIDERS[config.activeProvider].name}</Badge>
          </div>
        </div>
      </Card>
      <PlanCard returnState={billingReturn} />
      <JobsLakeApiCard returnState={params.get("api")} />
      <YourDataCard />
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
