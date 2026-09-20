"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";
import { MobileNav } from "@/components/navigation/MobileNav";
import { MobileSidebarDrawer } from "@/components/navigation/MobileSidebarDrawer";
import { Toaster } from "@/components/feedback/Toast";
import { StoreHydrator } from "@/store/StoreHydrator";
import { useHydration } from "@/store/hydration";
import { useCareerStore } from "@/store/career";
import { useAuthStore } from "@/store/auth";
import { PageLoading } from "@/components/common/States";

/**
 * Renders product pages once local state is hydrated. A signed-in account
 * that hasn't finished onboarding is taken there first, so Career DNA exists
 * before any run or match is shown.
 */
function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydration((s) => s.hydrated);
  const onboarded = useCareerStore((s) => s.onboarded);
  const mode = useAuthStore((s) => s.mode);
  const router = useRouter();
  const pathname = usePathname();
  const needsOnboarding = hydrated && mode === "user" && !onboarded;
  useEffect(() => {
    if (needsOnboarding) router.replace(`/onboarding?next=${encodeURIComponent(pathname)}`);
  }, [needsOnboarding, router, pathname]);
  if (!hydrated || needsOnboarding) {
    return (
      <div className="p-6">
        <PageLoading />
      </div>
    );
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StoreHydrator>
      <div className="flex min-h-dvh bg-bg">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10 lg:px-8">
            <Gate>{children}</Gate>
          </main>
        </div>
      </div>
      <MobileNav />
      <MobileSidebarDrawer />
      <Toaster />
    </StoreHydrator>
  );
}
