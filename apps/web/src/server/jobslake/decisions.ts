import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";

/**
 * Data-source decisions waiting on the owner that aren't a source record (owner, 2026-11-01: "anything related to data
 * source pending on me, should be in the set up page"). Each module session adds its own here, in its own PR; the owner
 * marks one done on Setup to-do, and it leaves the list. Sources needing a key, terms or activation are listed from
 * their own records (setup.ts), not here.
 */
export interface OwnerDecision {
  id: string;
  /** The module it concerns (a module id), or "all". */
  module: string;
  title: string;
  /** What to decide, and what each answer means, in a line or two. */
  detail: string;
  /** Where to read more or act, when there is a place. */
  href?: string;
  /** The countries it concerns; every country when not given. */
  geography?: string[];
}

export const OWNER_DECISIONS: OwnerDecision[] = [
  { id: "buddy4study-crawl", geography: ["IN"], module: "scholarships", title: "Buddy4Study: crawl its scholarship pages?", detail: "India's largest scholarship list has no open API or feed, but its robots.txt allows its sitemap (about 1,370 scholarship pages, many expired), and each page carries the scholarship's deadline, eligibility and award as structured data. Yes: add it as a paused gateway sitemap crawl (daily, with a crawl delay), terms pending. No: Scholarships & Projects links to Buddy4Study instead.", href: "/platform/jobs-lake/gateway" },
  { id: "nsp-link-only", geography: ["IN"], module: "scholarships", title: "National Scholarship Portal: link only", detail: "scholarships.gov.in publishes no API, feed or data.gov.in dataset of open schemes, and its site did not complete a secure connection from our servers on 2026-11-01. Government schemes are applied for only on the portal, so Scholarships & Projects links to it. Confirm, or name an official dataset to read." },
  { id: "osm-overpass-server", geography: ["IN"], module: "services", title: "Where OpenStreetMap collection runs", detail: "Talent & Services and Therapists collect OpenStreetMap businesses weekly through Overpass. The public overpass-api.de asks commercial users to run their own or a paid server. Pick one (self-hosted, a paid provider, or the public server for now).", href: "/platform/jobs-lake/gateway" },
  { id: "ticketmaster-cache", geography: ["global"], module: "events", title: "Ticketmaster: is a 24-hour search cache acceptable?", detail: "Ticketmaster's terms allow keeping content only “for reasonable periods”. WorksLake caches a search for up to 24 hours. Confirm, or ask for no caching." },
  { id: "developers-events-nc", module: "events", title: "developers.events: CC BY-NC licence", detail: "Its README licenses the data for non-commercial use only. It stays paused: decide WonderWorks' use is allowed, or ask the maintainers (scraly/developers-conferences-agenda) for permission." },
  { id: "gdg-cncf-robots", module: "events", title: "GDG and CNCF community events (Bevy API)", detail: "About 900 live developer community events, but their robots.txt disallows /api/, and WorksLake honours robots.txt. Keep it off, or ask Bevy or Google for permission." },
  { id: "freelancer-terms", module: "services", title: "Freelancer.com: caching and ratings", detail: "Its API terms limit caching to 24 hours and reserve its ratings. The source is live meanwhile. Confirm with Freelancer, or stop showing its ratings." },
  { id: "therapists-legal", module: "therapists", title: "Therapists: legal input", detail: "Before more than open-data practices: licence verification, health-data handling, crisis resources, and how practitioners' claims are shown." },
  { id: "therapists-india-hospitals", geography: ["IN"], module: "therapists", title: "Therapists: India's government hospital directory (GODL, 2017)", detail: "The National Hospital Directory on AIKOSH/data.gov.in is open (GODL) but static, dated 2017 and general: hospitals, not counselling or psychiatry practices. It is not added. Say if you want a one-off import of the hospitals that list a psychiatry department, shown as 'Listed in the 2017 government directory'; or name a practice chain with open site markup to crawl.", href: "https://aikosh.indiaai.gov.in/home/datasets/details/national_hospital_directory_with_geo_code_and_additional_parameters_updated_till_last_month.html" },
  { id: "cofounders-india-partners", geography: ["IN"], module: "cofounders", title: "Co-founders: which Indian incubators, E-cells and founder communities to ask?", detail: "No lawful open source of Indian founders or programmes exists: Startup India, AIM and MeitY Startup Hub publish no feed, and founder profiles on LinkedIn, YC and AngelList are private individuals. The route that works is partner uploads of people who opted in (Platform → Gateway → Add a partner, which asks the partner to confirm each person agreed). Pick a few to ask (for example NSRCEL, SINE IIT Bombay, IIT Madras Research Park, T-Hub, Startup TN, a college E-cell); the template and the words to send them are in docs/EXTERNAL_DATA_SOURCES.md section 8. Reading an upload into Co-founders is built when the first partner agrees.", href: "/platform/jobs-lake/gateway" },
  { id: "teaching-india-partners", geography: ["IN"], module: "teaching", title: "India teaching jobs: which schools and recruiters to ask?", detail: "No open Indian school-vacancy feed exists. FreeJobAlert's RSS lists government and university notices but names no employer (free text in the title), so it was not added. KVS, NVS and UGC sites did not answer from our servers. The route that works is partner uploads: pick a few school groups, coaching chains or recruiters to ask for written permission to upload their openings (Platform → Gateway).", href: "/platform/jobs-lake/gateway" },
  { id: "teachaway-permission", geography: ["global"], module: "teaching", title: "TeachAway: written permission", detail: "TeachAway is a recruiter; its listings are in the gateway catalogue, paused. Its terms may need written permission rather than public reuse." },
  { id: "helsinki-crowding", geography: ["FI"], module: "events", title: "Helsinki Linked Events: add it?", detail: "About 3,700 Finnish events (CC BY 4.0) are ready in the gateway catalogue. Until Find narrows by the person's place, they would crowd broad words such as “music”. Activate it, or leave it paused.", href: "/platform/jobs-lake/gateway" },
  { id: "india-gov-internships", geography: ["IN"], module: "internships", title: "Indian government internship portals", detail: "AICTE's internship portal, NATS, DRDO and data.gov.in didn't answer WorksLake's servers (outside India); NITI Aayog refused (403); RBI shows a bot check; the PM Internship Scheme lists openings only after sign-in; ISRO describes a standing scheme, not dated openings. None can be read now. Ask the ministries for a feed or partnership, or run collection from a server in India." },
  { id: "internshala-partnership", geography: ["IN"], module: "internships", title: "Internshala: partnership", detail: "India's largest internship site. It has no API or feed, its terms forbid automated access, and its pages carry bot protection, so WorksLake doesn't read it. Ask Internshala for a partnership or data feed." },
  { id: "luma-events", module: "events", title: "Luma: add a global events crawl?", detail: "Luma (luma.com) lists community events worldwide, with schema.org Event data and a sitemap its robots.txt lists (about 17,000 event pages). None of 16 sampled pages were in India, and at the polite rate one pass takes about two weeks. Say if you want it (a gateway crawl source, paused until you Test and Activate)." },
  { id: "unstop-robots", geography: ["IN"], module: "internships", title: "Unstop: robots.txt disallows /api/", detail: "Internships and Scholarships read Unstop's /api/ paths, which its robots.txt disallows, and it states no reuse terms. Both sources are live meanwhile. Ask Unstop for permission, or pause both." },
  { id: "wedmegood-content-signal", geography: ["IN"], module: "services", title: "WedMeGood: content signal", detail: "WedMeGood's robots.txt allows crawling and signals search=yes, ai-train=no. WonderWorks only indexes and links (no model training), so this fits; confirm, then add, test and activate its four sources.", href: "/platform/jobs-lake/gateway" },
  { id: "ncs-data-access", geography: ["IN"], module: "jobs", title: "National Career Service (India): ask for data access", detail: "NCS (ncs.gov.in, Ministry of Labour) lists government and private vacancies but has no public API, feed or sitemap, and its search is behind its own pages, so Jobs doesn't read it. If you want it, ask NCS / data.gov.in for a vacancy data feed or API access; Jobs adds it once there is one.", href: "https://www.ncs.gov.in/" },
  { id: "india-boards-blocked", geography: ["IN"], module: "jobs", title: "Naukri, foundit, Shine, Instahyre: blocked to WonderWorks", detail: "Each answers WonderWorks' servers with 403 (Naukri and foundit even for robots.txt), so none is read. They stay \"partner portals\" (Naukri and foundit already are): reach them only through a data partnership. Decide whether to approach them.", href: "/platform/jobs-lake" },
  { id: "udyam-list-api", geography: ["IN"], module: "services", title: "Udyam MSME list: request the data.gov.in API?", detail: "data.gov.in publishes district-wise Udyam counts, and a \"List of MSME Registered Units under UDYAM\" resource whose API \"does not exist yet\"; the portal has a Request API button. Request it (Talent & Services and Therapists could then read registered service businesses, no personal details), or leave government listings out.", href: "https://data.gov.in/resource/list-msme-registered-units-under-udyam" },
  { id: "marketplace-india-shops", geography: ["IN"], module: "marketplace", title: "Buy, Sell & Rent: confirm three Indian shops' terms", detail: "Chumbak, Okhai (artisan-made handicrafts) and TJORI each publish their public product list (price, link, category) on their own site; robots.txt allows it. Their terms on reusing it aren't confirmed (\"terms pending\"). Each is a paused gateway source: confirm with the shop (or decide it's fine), then Test and Activate. Find shows each item as a link to the shop, never as something sold or paid for on WonderWorks.", href: "/platform/jobs-lake/gateway" },
  { id: "marketplace-india-preloved", geography: ["IN"], module: "marketplace", title: "Buy, Sell & Rent: no open India pre-loved dealer feed found", detail: "OLX, Quikr and Facebook Marketplace forbid automated reading (never read). Refurbished dealers (Cashify and others) publish no feed, and Nicobar rate-limits our servers (429; not retried). eauctionsindia.com's bank-auction notices are mostly property, which is out of scope (Buy, Sell & Rent is sell-only, no housing). Name dealers or co-operatives to ask for a partner upload (Platform → Gateway), or confirm property auctions stay out.", href: "/platform/jobs-lake/gateway" },
  { id: "scheduler-settings", module: "all", title: "Check the Scheduler settings", detail: "Unit tests overwrote wj.scheduler earlier (before tests were isolated). Check the collection schedules and limits are what you want.", href: "/platform/jobs-lake/scheduler" },
];

export interface DecisionState {
  at: string;
  by: string;
  note?: string;
}

const KEY = "wj.setupdecisions" as const;

export async function decisionsDone(): Promise<Record<string, DecisionState>> {
  const doc = (await stateStore.get(PLATFORM_TENANT, KEY))?.state as { done?: Record<string, DecisionState> } | undefined;
  return doc?.done ?? {};
}

/** Marks a decision done (or, with done false, back on the list). Only known decisions. */
export async function setDecision(id: string, done: boolean, by: string, note?: string, now = new Date()): Promise<boolean> {
  if (!OWNER_DECISIONS.some((d) => d.id === id)) return false;
  const current = await decisionsDone();
  const next = { ...current };
  if (done) next[id] = { at: now.toISOString(), by: by.slice(0, 120), ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) };
  else delete next[id];
  await stateStore.put(PLATFORM_TENANT, KEY, { done: next });
  return true;
}
