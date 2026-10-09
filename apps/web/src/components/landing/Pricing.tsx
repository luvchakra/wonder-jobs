import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { PlanId, PlansConfig } from "@/domain/billing/plans";
import { formatMoney } from "@/domain/billing/format";
import { cn } from "@/lib/cn";

const ORDER: PlanId[] = ["free", "pro", "max"];

/** ₹499 rather than ₹499.00 when the price is whole; otherwise as billing shows it. */
const wholePrice = (minor: number, currency: string) => (minor % 100 === 0 ? new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100) : formatMoney(minor, currency));

/** What a plan gives, in its own numbers — read from the plan configuration checkout uses — then the lines an operator added in Plans & features. */
export function planPoints(l: PlansConfig["plans"][PlanId]): string[] {
  return [
    `${l.roles} role${l.roles === 1 ? "" : "s"} to search for`,
    `${l.scheduledSearches} scheduled search${l.scheduledSearches === 1 ? "" : "es"}, ${l.dailySearches ? "daily or weekly" : "weekly"}`,
    ...(l.keepWatch ? ["Keep watch — hear when a strong match turns up"] : []),
    `${l.aiDraftsPerMonth} AI drafts a month`,
    l.resumeTemplates >= 8 ? "All résumé designs" : `${l.resumeTemplates} résumé design${l.resumeTemplates === 1 ? "" : "s"}`,
    ...(l.applyWithWonder ? ["Apply with Wonder — fills employer forms, on computer and phone"] : []),
    ...(l.highlights ?? []),
  ];
}

/** Free, Pro and Max as configured in billing (Platform → Billing), so the page and checkout always agree. */
export function PricingSection({ plans }: { plans: PlansConfig["plans"] }) {
  return (
    <section id="pricing" className="scroll-mt-20 bg-white py-20 md:py-28" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="wj-eyebrow text-brand-700">Pricing</p>
        <h2 id="pricing-title" className="mt-3 text-h2 font-semibold text-ink">
          Start free. <span className="wj-gradient-text">Upgrade when you&apos;re applying.</span>
        </h2>
        <p className="mt-4 max-w-xl text-[16px] text-ink-2">Every plan searches every live source and explains every match. No card to start.</p>
        <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {ORDER.map((id) => {
            const l = plans[id];
            const featured = id === "pro";
            return (
              <li key={id} className={cn("flex flex-col rounded-[24px] border p-6", featured ? "border-brand-300 bg-brand-50/40 shadow-[0_20px_50px_-24px_rgba(109,76,245,0.45)]" : "border-line bg-surface-2")}>
                <p className="flex items-center gap-2 text-[18px] font-semibold text-ink">
                  {l.label}
                </p>
                <p className="text-[13px] text-ink-3">{l.tagline}</p>
                <p className="mt-4 text-[34px] font-semibold tracking-tight text-ink">
                  {l.priceMinor > 0 ? wholePrice(l.priceMinor, l.currency) : "Free"}
                  {l.priceMinor > 0 && <span className="ml-1 text-[14px] font-normal text-ink-3">/ month</span>}
                </p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[14px] text-ink-2">
                  {planPoints(l).map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up" className={cn("mt-6 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors", featured ? "wj-gradient-bg text-white" : "border border-line bg-white text-ink hover:border-line-strong")}>
                  {id === "free" ? "Get started free" : `Start free, then ${l.label}`} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-[12.5px] text-ink-3">
          Prices per month, billed by Stripe or Razorpay; cancel any time from Account. The JobsLake API is billed separately — a free monthly allowance, then pay as you go. <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link>
        </p>
      </div>
    </section>
  );
}
