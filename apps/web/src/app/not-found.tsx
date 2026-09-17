import Link from "next/link";
import { WonderLogo } from "@/components/brand/WonderLogo";
import { Button } from "@/components/common/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
      <WonderLogo />
      <div>
        <h1 className="text-h2 font-semibold text-ink">This page isn&apos;t out there.</h1>
        <p className="mt-2 text-[15px] text-ink-3">But your next opportunity is. Let&apos;s get you back.</p>
      </div>
      <div className="flex gap-2">
        <Button href="/app">Go to dashboard</Button>
        <Button href="/" variant="outline">
          Home
        </Button>
      </div>
      <Link href="/app/jobs" className="text-[13px] font-medium text-brand-600 hover:underline">
        Browse jobs
      </Link>
    </div>
  );
}
