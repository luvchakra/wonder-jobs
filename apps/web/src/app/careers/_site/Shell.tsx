import Link from "next/link";
import { WonderLogo } from "@/components/brand/WonderLogo";

/** The frame of WonderJobs' own careers pages (/careers, /careers/<job id>, /careers/status). */
export function CareersShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <WonderLogo size={24} href="/" />
          <Link href="/careers" className="text-[14px] font-medium text-ink-2 hover:text-ink">
            Careers
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {children}
      </main>
    </div>
  );
}

/** A careers page that can't show jobs: why, for visitors, and for an admin the reason behind it. */
export function CareersNotice({ title, body, adminReason, retry }: { title: string; body?: string; adminReason?: string | null; retry?: string }) {
  return (
    <div className="max-w-xl">
      <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
      {body && <p className="mt-3 text-[15px] text-ink-2">{body}</p>}
      {retry && (
        <a href={retry} className="mt-5 inline-flex min-h-10 items-center rounded-full border border-line px-5 text-[14px] font-medium text-ink hover:bg-surface-2">
          Try again
        </a>
      )}
      {adminReason && (
        <p className="mt-6 rounded-[12px] border border-warning-600/30 bg-warning-100/40 p-4 text-[13px] text-ink-2">
          <b>For admins:</b> {adminReason}
        </p>
      )}
    </div>
  );
}
