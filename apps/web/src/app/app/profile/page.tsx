"use client";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Crown, Dna, Settings2, Sparkles, Timer, BarChart3, FileText, MessagesSquare, BookOpen, Calendar, LogOut } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useAIStore } from "@/store/ai";
import { AI_PROVIDERS } from "@/domain/ai/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { PageLoading } from "@/components/common/States";
import { toast } from "@/components/feedback/Toast";
import { syncStatus } from "@/store/remoteStorage";
import { Cloud, CloudOff } from "lucide-react";

const MORE = [
  { href: "/app/career-dna", label: "Career DNA", icon: Dna },
  { href: "/app/calendar", label: "Calendar", icon: Calendar },
  { href: "/app/insights", label: "Insights", icon: BarChart3 },
  { href: "/app/automation/scheduled", label: "Scheduled Runs", icon: Timer },
  { href: "/app/automation/settings", label: "Automation Settings", icon: Settings2 },
  { href: "/app/settings/ai", label: "AI Provider", icon: Sparkles },
  { href: "/app/resume-studio", label: "Resume Studio", icon: FileText },
  { href: "/app/interview-prep", label: "Interview Prep", icon: MessagesSquare },
  { href: "/app/learning", label: "Learning", icon: BookOpen },
];

function CloudSyncCard() {
  const [backend, setBackend] = useState<"supabase" | "local" | "unknown">("unknown");
  const sync = useSyncExternalStore(syncStatus.subscribe, syncStatus.get, () => "idle" as const);
  useEffect(() => {
    fetch("/api/state/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { backend: "supabase" | "local" }) => setBackend(d.backend))
      .catch(() => setBackend("local"));
  }, []);
  const cloud = backend === "supabase";
  return (
    <Card className="mt-4 flex items-start gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${cloud ? "bg-success-100 text-success-600" : "bg-bg-soft text-ink-3"}`}>{cloud ? <Cloud className="size-5" aria-hidden /> : <CloudOff className="size-5" aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">{backend === "unknown" ? "Checking sync…" : cloud ? "Synced to the cloud" : "Stored on this device only"}</p>
        <p className="text-[12px] text-ink-3">{cloud ? `Your Career DNA, applications, runs and settings are saved to your account${sync === "syncing" ? " · saving…" : sync === "local" ? " · last save didn't reach the server, retrying on next change" : ""}.` : "Persistence isn't configured on this deployment yet, so data lives in this browser. Provider keys are held in memory only."}</p>
      </div>
    </Card>
  );
}

function ProfileInner() {
  const params = useSearchParams();
  const dna = useCareerStore((s) => s.dna);
  const plan = useCareerStore((s) => s.plan);
  const config = useAIStore((s) => s.config);
  const upgrade = params.get("upgrade") === "1";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" />
      <Card className="flex items-center gap-4">
        <Avatar name={dna.name} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">{dna.name}</p>
          <p className="text-[13px] text-ink-3">{dna.headline}</p>
          <div className="mt-1 flex gap-2">
            <Badge tone={plan === "pro" ? "brand" : "neutral"}>{plan === "pro" ? "Pro" : "Free plan"}</Badge>
            <Badge>{AI_PROVIDERS[config.activeProvider].name}</Badge>
          </div>
        </div>
      </Card>
      <CloudSyncCard />
      {(plan === "free" || upgrade) && (
        <Card className="mt-4 border-brand-200 bg-brand-50/60">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-600">
              <Crown className="size-5" aria-hidden />
            </span>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-ink">Upgrade to Pro</p>
              <p className="text-[13px] text-ink-2">Unlock more runs, AI models and advanced features. Billing isn&apos;t connected in this environment yet — this records your interest.</p>
              <Button size="sm" className="mt-3" onClick={() => toast.info("Thanks for your interest", "We'll let you know when Pro billing is available.")}>
                Upgrade
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card padding="none" className="mt-4">
        <ul className="divide-y divide-line">
          {MORE.map((m) => (
            <li key={m.href}>
              <Link href={m.href} className="flex items-center gap-3 px-4 py-3.5 text-[14px] text-ink hover:bg-surface-2">
                <m.icon className="size-4 text-ink-3" aria-hidden />
                <span className="flex-1">{m.label}</span>
                <ChevronRight className="size-4 text-ink-4" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/" className="flex items-center gap-3 px-4 py-3.5 text-[14px] text-ink hover:bg-surface-2">
              <LogOut className="size-4 text-ink-3" aria-hidden />
              <span className="flex-1">Sign out</span>
            </Link>
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
