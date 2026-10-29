import type { Metadata } from "next";
import { PRIVATE_PAGE } from "@/lib/robots";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HELP_FAQ, HELP_SECTIONS } from "@/content/help";
import { HelpAssistant } from "@/components/help/HelpAssistant";
import { HelpBackLink } from "@/components/help/HelpBackLink";
import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/Sections";
import { helpAccess } from "@/server/helpAccess";

export const metadata: Metadata = {
  title: "Help & user guide",
  description: "How WonderStar finds, scores and prepares opportunities, what it never does without you, what to do when something goes wrong, and answers to common questions.",
  // Signed-in only (WJ-309): never indexed.
  ...PRIVATE_PAGE,
};

// Rendered per request for a signed-in reader, never prerendered or cached publicly.
export const dynamic = "force-dynamic";

/** Help center for signed-in accounts: FAQ + user guide + an assistant that answers from the guide. Linked from the avatar menu as "Get Help". */
export default async function HelpPage() {
  if ((await helpAccess()) !== "allowed") redirect("/sign-in?next=%2Fhelp");
  return (
    <div className="bg-white text-ink">
      <MarketingNav />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6">
        <HelpBackLink />
        <header className="mt-4 max-w-2xl">
          <p className="wj-eyebrow text-brand-600">Get help</p>
          <h1 className="mt-2 text-[36px] font-semibold leading-tight tracking-tight md:text-[44px]">User guide &amp; FAQ</h1>
          <p className="mt-3 text-[15px] text-ink-2">How Wonder searches, scores and prepares, what it never does without you, what to do when something goes wrong, and what is still on the way.</p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Guide sections" className="lg:sticky lg:top-24 lg:self-start">
            <p className="wj-eyebrow mb-3 text-[11px]">In this guide</p>
            <ol className="flex flex-col gap-1">
              <li>
                <a href="#faq" className="block rounded-[10px] px-3 py-2 text-[13.5px] text-ink-2 hover:bg-bg-soft hover:text-ink">
                  Frequently asked questions
                </a>
              </li>
              {HELP_SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-[10px] px-3 py-2 text-[13.5px] text-ink-2 hover:bg-bg-soft hover:text-ink">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <HelpAssistant />

            <section id="faq" className="mt-12 scroll-mt-24" aria-labelledby="faq-title">
              <h2 id="faq-title" className="text-[24px] font-semibold tracking-tight">
                Frequently asked questions
              </h2>
              <dl className="mt-5 divide-y divide-line rounded-[20px] border border-line">
                {HELP_FAQ.map((f) => (
                  <div key={f.q} className="p-5">
                    <dt className="text-[15px] font-semibold text-ink">{f.q}</dt>
                    <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
                      {f.a}{" "}
                      <a href={`#${f.section}`} className="font-medium text-brand-600 hover:underline">
                        More →
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {HELP_SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="mt-12 scroll-mt-24" aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`} className="text-[24px] font-semibold tracking-tight">
                  {s.title}
                </h2>
                <p className="mt-1 text-[14px] text-ink-3">{s.summary}</p>
                <p className="mt-1 text-[12px] text-ink-4">Last updated {updatedLabel(s.updated)}</p>
                <div className="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
                  {groupBullets(s.body).map((block, i) =>
                    Array.isArray(block) ? (
                      <ul key={i} className="list-disc space-y-1.5 pl-5">
                        {block.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i}>{block}</p>
                    ),
                  )}
                </div>
              </section>
            ))}

            <section className="mt-14 rounded-[24px] bg-ink p-6 text-white md:p-8" aria-label="Still stuck">
              <h2 className="text-[20px] font-semibold">Still stuck?</h2>
              <p className="mt-1 text-[14px] text-white/75">Send a note and a human will get back to you.</p>
              <Link href="/#contact" className="mt-4 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-ink">
                Contact us
              </Link>
            </section>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

/** "2026-10-16" → "16 Oct 2026", the same on the server and in every time zone. */
function updatedLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Consecutive "- " lines become one list. */
function groupBullets(lines: string[]): (string | string[])[] {
  const out: (string | string[])[] = [];
  for (const line of lines) {
    if (line.startsWith("- ")) {
      const last = out[out.length - 1];
      if (Array.isArray(last)) last.push(line.slice(2));
      else out.push([line.slice(2)]);
    } else out.push(line);
  }
  return out;
}
