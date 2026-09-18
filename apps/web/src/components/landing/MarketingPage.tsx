import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./Sections";

export type Section = { id: string; title: string; body: ReactNode };

/** Shared frame for the public company/legal pages: nav, title, dated sections, footer. */
export function MarketingPage({ eyebrow, title, intro, updated, sections, children }: { eyebrow: string; title: string; intro: string; updated?: string; sections?: Section[]; children?: ReactNode }) {
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-3xl px-4 pb-20 pt-24 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Home
        </Link>
        <header className="mt-4">
          <p className="wj-eyebrow text-brand-600">{eyebrow}</p>
          <h1 className="mt-2 text-[36px] font-semibold leading-tight tracking-tight md:text-[44px]">{title}</h1>
          <p className="mt-3 text-[16px] text-ink-2">{intro}</p>
          {updated && <p className="mt-2 text-[12.5px] text-ink-4">Last updated {updated}</p>}
        </header>
        {sections && (
          <nav aria-label="On this page" className="mt-8 rounded-[16px] bg-surface-2 p-4 text-[13.5px]">
            <p className="wj-eyebrow text-[11px]">On this page</p>
            <ol className="mt-2 grid gap-1 sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-ink-2 hover:text-ink">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {sections?.map((s) => (
          <section key={s.id} id={s.id} className="mt-10 scroll-mt-24" aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`} className="text-[22px] font-semibold tracking-tight">
              {s.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc">{s.body}</div>
          </section>
        ))}
        {children}
        <p className="mt-14 rounded-[16px] border border-line p-4 text-[13.5px] text-ink-3">
          Questions about any of this?{" "}
          <Link href="/#contact" className="font-semibold text-brand-600 hover:underline">
            Contact us
          </Link>{" "}
          or read the{" "}
          <Link href="/help" className="font-semibold text-brand-600 hover:underline">
            help center
          </Link>
          .
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
