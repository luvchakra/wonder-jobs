"use client";
import { PageHeader } from "@/wonderworks/chrome/PageHeader";
import { useAuthStore } from "@/store/auth";
import { NotifyPrefsCard } from "@/components/account/NotifyPrefsCard";
import { PushNotifications } from "@/components/pwa/PushNotifications";
import { DigestEmailCard } from "@/components/account/DigestEmailCard";

/**
 * Notifications & email (owner, 2026-10-22): every kind of notification and how each reaches you — in the bell, by
 * push, by email — with notifications on this device and the activity email. The list itself is the Notification center.
 */
export default function NotificationSettingsPage() {
  const signedIn = useAuthStore((s) => s.mode) === "user";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" description="Choose what you're told, and how." back={{ href: "/app/notifications", label: "Notification center" }} />
      {signedIn ? (
        <>
          <PushNotifications />
          <NotifyPrefsCard />
          <DigestEmailCard />
        </>
      ) : (
        // Choices are kept with an account; a signed-out browser has none to keep them in.
        <p className="text-[13px] text-ink-3">Sign in to choose what WonderStar tells you, and how.</p>
      )}
    </div>
  );
}
