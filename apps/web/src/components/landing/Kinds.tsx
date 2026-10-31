import Link from "next/link";
import { ArrowRight, Bell, Bookmark, Check, LayoutList, Share2, SlidersHorizontal, ToggleRight, UserRound } from "lucide-react";
import { MODULES } from "@/modules/registry";
import { ModuleIconTile } from "@/wonderworks/brand/tiles";
import { ScrollReveal } from "@/components/common/ScrollReveal";

/**
 * What each kind of WonderWorks does, for the landing page. The name, the one-line hint, the icon and the Pipeline tab's
 * name and stages come from the modules themselves (modules/registry.ts), so they can't drift from the app; only the
 * plain-language points are written here, each one taken from what the module's help says it does today.
 */
const POINTS: Record<string, { line: string; does: string[] }> = {
  jobs: {
    line: "Full-time and part-time jobs, from real sources.",
    does: ["One search across employers' own career sites, job boards and remote feeds, with the pay and the source on every listing", "Every match explains itself, and so does every one it hides", "A résumé from eight ATS-friendly templates, tailored to the job", "Apply with Wonder fills the employer's form on your computer; you review and submit"],
  },
  internships: {
    line: "Student roles and co-ops.",
    does: ["Search internships with the stipend, duration and start date shown where the posting states them", "Apply in one tap to internships companies post on WonderWorks, with your details and résumé", "Deadlines for the ones you saved, offers waiting for your answer"],
  },
  teaching: {
    line: "School and college teaching jobs.",
    does: ["Find openings by subject, grade level and board, posted by schools, colleges and coaching centres", "Apply in one tap; your subjects, grades, boards and qualifications go with it", "Some schools include a demo class: it says so on the job, and the school offers you times"],
  },
  services: {
    line: "Hire a pro, or offer a skill.",
    does: ["Pros list work at your door or projects you can hand over remotely, with price, warranty and turnaround as they state them", "Request a quote, then book it; follow the job through done, paid and reviewed", "Ratings on WonderWorks come only from clients whose job was marked done"],
  },
  therapists: {
    line: "Counsellors near you or online.",
    does: ["A directory of practitioners who list themselves: languages, focus areas, fee and how they meet", "Request a session; the practitioner confirms the day and time", "WonderWorks keeps no clinical records and never asks why you're looking; it also hasn't checked anyone's licence, and says so on every page"],
  },
  cofounders: {
    line: "Find someone to build with.",
    does: ["People and teams of founders who chose to be found, each showing only what they chose to show", "Connect only when interest is mutual; names and contact details stay hidden until you both agree", "Block anyone, or report a person, a team or a message; blocking hides you from each other"],
  },
  events: {
    line: "Meetups and things to do.",
    does: ["Organisers post events with the time, place and seats", "RSVP takes a seat; when it's full you join the waitlist and the next person in line is given a seat that opens", "Free events for now; paid events aren't open yet"],
  },
  marketplace: {
    line: "Handicrafts and pre-loved items.",
    does: ["List what you're selling with up to eight photos, a price and its condition; rentals aren't open yet", "Message the seller from the listing, make an offer and agree to meet; track it as Messaged, Offer, Visit, Done", "Report and Block on every listing and conversation, and no phone numbers or links go in a message"],
  },
};

const live = MODULES.filter((m) => m.status === "live");

/** The eight kinds as one grid of cards: what each is, and what its tab for tracking is called. Home page. */
export function KindsSection() {
  return (
    <section id="kinds" className="bg-white py-20 md:py-28" aria-labelledby="kinds-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">One account, eight kinds</p>
          <h2 id="kinds-title" className="mt-3 text-h2 font-semibold text-ink">
            Not just jobs. <span className="wj-gradient-text">Pick what you need.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">Switch kind from the menu at the top. Each one has the same four tabs — Find, Saved, a tab for tracking what you started, and You — so once you know one, you know them all. What you search for, save and track never mixes between kinds.</p>
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {live.map((m, i) => (
            <ScrollReveal as="li" key={m.id} delay={(i % 4) * 70}>
              <Link href={`/features#kind-${m.id}`} className="wj-elevate group flex h-full flex-col rounded-[22px] border border-line bg-surface-2 p-5">
                <ModuleIconTile m={m} />
                <span className="mt-4 text-[17px] font-semibold text-ink">{m.label}</span>
                <span className="mt-1 flex-1 text-[14px] leading-relaxed text-ink-3">{POINTS[m.id]?.line ?? m.hint}</span>
                <span className="mt-4 text-[12px] text-ink-4">
                  Tracked in <span className="font-medium text-ink-2">{m.pipeline.label}</span>
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600">
                  What it does <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Every kind in full: what you can do, and how it is tracked, stage by stage. Features page. */
export function KindFeatures() {
  return (
    <section id="kinds" className="bg-white py-16 md:py-24" aria-labelledby="kinds-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">Eight kinds</p>
          <h2 id="kinds-title" className="mt-3 text-h2 font-semibold text-ink">
            What you can do, <span className="wj-gradient-text">kind by kind.</span>
          </h2>
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
          {live.map((m) => (
            <ScrollReveal as="li" key={m.id}>
              <article id={`kind-${m.id}`} className="h-full scroll-mt-24 rounded-[22px] border border-line bg-surface-2 p-6">
                <div className="flex items-center gap-3">
                  <ModuleIconTile m={m} />
                  <div>
                    <h3 className="text-[18px] font-semibold text-ink">{m.label}</h3>
                    <p className="text-[13px] text-ink-3">{POINTS[m.id]?.line ?? m.hint}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {(POINTS[m.id]?.does ?? []).map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-2">
                      <Check className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-3">
                  <span className="font-semibold text-ink-2">{m.pipeline.label}:</span> {m.pipeline.stages.map((s) => s.label).join(" · ")}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

const SAME: { icon: typeof Bookmark; t: string; s: string }[] = [
  { icon: SlidersHorizontal, t: "Find", s: "Type what you want and press Search. Refine narrows by the things that matter for that kind. Opening the page searches nothing: it shows your last search, on any device you're signed in on." },
  { icon: Bookmark, t: "Saved", s: "Keep anything from any kind in one place, and narrow your saves as you type." },
  { icon: LayoutList, t: "A tab for what you started", s: "Pipeline, Applications, Bookings, Sessions, Connections, My events or Deals: named for the kind, with its own stages and counts." },
  { icon: UserRound, t: "You", s: "Your Career Profile, your résumés, and the few details each kind compares with what it finds. Nothing is guessed." },
  { icon: Share2, t: "Share", s: "Every listing has Share, on its card and its page. It sends everything the listing says right now to WhatsApp, email or your phone's share sheet, and the link opens a page anyone can read, with a proper preview." },
  { icon: Bell, t: "Notifications by kind", s: "The bell and the Notifications page show only the kind you're in, plus anything about your account." },
  { icon: ToggleRight, t: "You choose how it acts", s: "Every one-tap action — apply, request, RSVP, offer — is Automatic, Ask me or Off, in You. Wonder prepares; it never presses submit unless you switched that on." },
];

/** What every kind has in common. Features page. */
export function SameEverywhere() {
  return (
    <section id="every-kind" className="bg-surface-2 py-16 md:py-24" aria-labelledby="every-kind-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">The same in every kind</p>
          <h2 id="every-kind-title" className="mt-3 text-h2 font-semibold text-ink">
            Learn it once. <span className="wj-gradient-text">Use it everywhere.</span>
          </h2>
        </ScrollReveal>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAME.map((f, i) => (
            <ScrollReveal as="li" key={f.t} delay={(i % 3) * 70}>
              <div className="h-full rounded-[22px] border border-line bg-white p-6">
                <span className="flex size-11 items-center justify-center rounded-[13px] bg-brand-50 text-brand-600">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{f.t}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{f.s}</p>
              </div>
            </ScrollReveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** For the other side: everyone who posts. Features page. */
export function PostingSection() {
  return (
    <section id="post" className="bg-white py-16 md:py-24" aria-labelledby="post-title">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <ScrollReveal>
          <p className="wj-eyebrow text-brand-700">For the other side</p>
          <h2 id="post-title" className="mt-3 text-h2 font-semibold text-ink">
            Posting something? <span className="wj-gradient-text">Same account.</span>
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-2">Companies, schools, pros, practitioners and organisers post from one workspace on the same account, with the same roles. Sellers and founders list from their own You tab. Open or close a listing whenever you like, and move each application, request or booking along yourself. The other person sees what you tell them, and you see only what they chose to show you.</p>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {["Jobs and internships: post, review applicants, make an offer", "Teaching: post an opening, ask for a demo class", "Talent & Services and Therapists: list yourself, send a quote or confirm a session", "Events: post an event, set the seats, the waitlist runs itself", "Co-founders: start a team and invite people", "Marketplace: list items with photos"].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-2">
                <Check className="mt-1 size-4 shrink-0 text-brand-600" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </ScrollReveal>
      </div>
    </section>
  );
}
