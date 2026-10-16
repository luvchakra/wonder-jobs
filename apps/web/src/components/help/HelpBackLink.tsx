import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The help center is for signed-in accounts (WJ-309), so the way back is always the app. */
export function HelpBackLink() {
  return (
    <Link href="/app" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Back to the app
    </Link>
  );
}
