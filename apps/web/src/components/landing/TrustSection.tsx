import Link from "next/link";
import { ArrowRight, CreditCard, FileLock2, Landmark, ShieldCheck } from "lucide-react";
import { ScrollReveal } from "@/components/common/ScrollReveal";

/**
 * Trust & compliance. Every line here is something the code does today (see docs/COMPLIANCE.md for
 * the control → code map). Wording is deliberate: "SOX-style controls", not "SOX compliant" — the
 * Sarbanes-Oxley Act applies to US-listed companies and is certified by auditors, not by a product.
 */
const PILLARS: { icon: typeof CreditCard; eyebrow: string; title: string; points: string[]; link: { href: string; label: string } }[] = [
  {
    icon: CreditCard,
    eyebrow: "Payments",
    title: "Razorpay and Stripe",
    points: [
      "WonderJobs is free today. When paid plans open, you pay with UPI AutoPay, cards or net banking through Razorpay, or international cards through Stripe",
      "You pay on the provider's own page; your card, UPI and bank details never reach WonderJobs",
      "Your plan changes only when the provider's signed confirmation arrives, never just because a page redirected",
      "Cancel any time and keep what you've paid for until the period ends",
    ],
    link: { href: "/terms#free", label: "Pricing and payment terms" },
  },
  {
    icon: FileLock2,
    eyebrow: "Privacy",
    title: "GDPR and India's DPDP Act",
    points: [
      "Download everything we hold about you as one file, straight from your profile",
      "Delete your account and its data yourself, at once; only records the law requires are kept",
      "A versioned privacy notice you accept in the app, with a published retention schedule and list of every processor",
      "No ads, no analytics, no tracking cookies, and no sale of data",
    ],
    link: { href: "/privacy", label: "Read the privacy notice" },
  },
  {
    icon: Landmark,
    eyebrow: "Financial controls",
    title: "SOX-style controls, built in",
    points: [
      "Every payment event goes into an append-only, hash-chained ledger that the database itself refuses to edit or delete",
      "Each event is verified by signature and recorded once, however often the provider retries",
      "A daily reconciliation against Razorpay and Stripe catches anything a missed notification would leave wrong",
      "Read-only auditor access to verify and export the ledger, separate from operator credentials",
    ],
    link: { href: "/security#financial", label: "How the ledger works" },
  },
  {
    icon: ShieldCheck,
    eyebrow: "Security",
    title: "IT security best practice",
    points: [
      "Security headers on every response: a content security policy, HSTS, and clickjacking and MIME-sniffing protection",
      "AI keys encrypted with AES-256-GCM; every account's data isolated and checked on each request",
      "Cross-site request checks on every endpoint that changes data, with rate and size limits where abuse is possible",
      "A dependency vulnerability audit on every change, automated updates, and a published way to report issues",
    ],
    link: { href: "/security", label: "Read the security overview" },
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="bg-white py-20 md:py-28" aria-labelledby="trust-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal className="max-w-2xl">
          <p className="wj-eyebrow text-brand-700">Trust &amp; compliance</p>
          <h2 id="trust-title" className="mt-3 text-h2 font-semibold text-ink">
            Your career data and your money,
            <br />
            <span className="wj-gradient-text">handled properly.</span>
          </h2>
          <p className="mt-4 text-[16px] text-ink-2">Payments through Razorpay and Stripe, privacy rights under the GDPR and India&apos;s DPDP Act, financial records kept the way auditors expect, and security practices applied on every request.</p>
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PILLARS.map((p, i) => (
            <ScrollReveal as="li" key={p.title} delay={(i % 2) * 70}>
              <div className="flex h-full flex-col rounded-[22px] border border-line bg-surface-2 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-brand-50 text-brand-600">
                    <p.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-700">{p.eyebrow}</p>
                    <h3 className="text-[18px] font-semibold text-ink">{p.title}</h3>
                  </div>
                </div>
                <ul className="mt-4 flex-1 space-y-2 text-[14px] leading-relaxed text-ink-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
                <Link href={p.link.href} className="mt-5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
                  {p.link.label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </ScrollReveal>
          ))}
        </ul>
        <p className="mt-6 text-[12.5px] text-ink-3">
          WonderJobs is not a public company and has not been audited under the Sarbanes-Oxley Act; the controls above are the ones such audits look for. Payment card security is handled by Razorpay and Stripe, which are PCI DSS Level 1 certified.
        </p>
      </div>
    </section>
  );
}
