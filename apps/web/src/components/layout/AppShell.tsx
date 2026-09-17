"use client";
import { Sidebar } from "@/components/navigation/Sidebar";
import { TopBar } from "@/components/navigation/TopBar";
import { MobileNav } from "@/components/navigation/MobileNav";
import { Toaster } from "@/components/feedback/Toast";
import { StoreHydrator } from "@/store/StoreHydrator";
import { useHydration } from "@/store/hydration";
import { PageLoading } from "@/components/common/States";

function Gate({ children }: { children: React.ReactNode }) {
  const hydrated = useHydration((s) => s.hydrated);
  if (!hydrated) {
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
      <Toaster />
    </StoreHydrator>
  );
}
