"use client";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { useAuthStore } from "@/store/auth";
import { NotifyPrefsCard } from "@/components/account/NotifyPrefsCard";
import { PushNotifications } from "@/components/pwa/PushNotifications";
import { DigestEmailCard } from "@/components/account/DigestEmailCard";
import type { TopicView } from "@/components/account/NotifyPrefsCard";
import { useSelectedModule } from "@/wonderworks/chrome/useModuleNav";
import { MODULES, type ModuleManifest } from "@/modules/registry";

/** Modules where people write to each other in the app. */
const CONVERSATIONS = new Set(["cofounders", "marketplace"]);

/** Jobs: every kind, with its updates worded for Jobs. */
const JOBS_TOPICS: TopicView[] = [
  { id: "messages" },
  { id: "interviews" },
  { id: "follow_ups" },
  { id: "matches" },
  { id: "searches" },
  { id: "applications", label: "Application updates", hint: "An application changes, or an AI draft is ready" },
  { id: "saved_jobs" },
];

/** Another module: only the kinds it sends, in its own words (owner, 2026-11-02: "no out of place information"). */
function moduleTopics(m: ModuleManifest): TopicView[] {
  return [
    ...(CONVERSATIONS.has(m.id) ? [{ id: "messages" as const, hint: `Someone writes to you in ${m.label}` }] : []),
    { id: "applications", label: `Updates in ${m.pipeline.label}`, hint: `Something in ${m.pipeline.label} changes: a reply, a new time, a decision` },
    { id: "matches", hint: `New ${m.label} listings that fit you, from your scheduled searches` },
    { id: "searches", hint: "How a scheduled search went, or that it needs you" },
  ];
}

/**
 * Notifications & email (owner, 2026-10-22): every kind of notification and how each reaches you — in the bell, by
 * push, by email — with notifications on this device and the activity email. The list itself is the Notification center.
 */
export default function NotificationSettingsPage() {
  const signedIn = useAuthStore((s) => s.mode) === "user";
  const selected = useSelectedModule();
  const m = selected === "jobs" ? null : MODULES.find((x) => x.id === selected)!;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" description={`Choose what WonderWorks tells you about ${m ? m.label : "Jobs"}, and how.`} back={{ href: "/app/notifications", label: "Notification center" }} />
      {signedIn ? (
        <>
          <PushNotifications />
          <NotifyPrefsCard topics={m ? moduleTopics(m) : JOBS_TOPICS} footnote="Each choice applies wherever that kind comes from, in every module." />
          <DigestEmailCard />
        </>
      ) : (
        // Choices are kept with an account; a signed-out browser has none to keep them in.
        <p className="text-[13px] text-ink-3">Sign in to choose what WonderWorks tells you, and how.</p>
      )}
    </div>
  );
}
