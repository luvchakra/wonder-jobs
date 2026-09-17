/**
 * Deterministic job universe used by the mock source adapters.
 * ~1,100 canonical roles, each posted on 1–3 sources → ~1,800 raw postings.
 * Regenerated on load (never persisted) so it stays cheap and stable.
 */
import type { Job } from "@/domain/jobs/types";
import { hashKey } from "@/lib/ids";
import { COMPANIES, JOB_SOURCES, LOCATIONS, SKILLS, TAGS_BY_TRACK, TITLES } from "./catalog";
import { prng } from "./prng";

const DAY = 86_400_000;

function weightedPick<T extends { weight: number }>(rand: ReturnType<typeof prng>, arr: readonly T[]) {
  const total = arr.reduce((n, x) => n + x.weight, 0);
  let r = rand.next() * total;
  for (const x of arr) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return arr[arr.length - 1];
}

function describe(title: string, company: string, track: string) {
  const intros: Record<string, string> = {
    product: `As a ${title} at ${company}, you will own the strategy and execution of products that help millions of users worldwide. You will work with cross-functional teams to define, build, and scale innovative solutions.`,
    growth: `As a ${title} at ${company}, you will own the growth roadmap end to end — from acquisition experiments to retention loops — partnering closely with design, data and engineering.`,
    program: `As a ${title} at ${company}, you will drive complex, cross-functional programs from kick-off to launch, keeping teams aligned on scope, risk and timelines.`,
    analytics: `As a ${title} at ${company}, you will turn product data into decisions: instrumenting funnels, designing experiments and telling the story behind the numbers.`,
    design: `As a ${title} at ${company}, you will shape how people experience our products — from research and prototyping to polished, accessible interfaces.`,
    engineering: `As a ${title} at ${company}, you will lead a team of engineers, own technical direction and partner with product to ship reliably at scale.`,
  };
  return `${intros[track]} You will collaborate with leadership to set goals, communicate progress, and continuously improve how we work.`;
}

const REQ_BY_TRACK: Record<string, string[]> = {
  product: [
    "years of product management experience",
    "Experience in consumer or B2B products",
    "Strong analytical and problem-solving skills",
    "Excellent communication skills",
    "Track record of shipping products end to end",
    "Comfort with SQL and product analytics tools",
    "Experience partnering with design and engineering",
  ],
  growth: ["years of growth or product experience", "Hands-on experimentation experience", "Strong analytical skills (SQL preferred)", "Excellent communication skills"],
  program: ["years of program management experience", "Experience running cross-functional programs", "Strong risk and dependency management", "Excellent written communication"],
  analytics: ["years of analytics experience", "Advanced SQL; Python is a plus", "Experience designing A/B tests", "Clear data storytelling"],
  design: ["years of product design experience", "Strong portfolio of shipped work", "Experience with design systems", "Comfort with user research"],
  engineering: ["years of engineering experience with 2+ leading teams", "Strong system design fundamentals", "Experience hiring and growing engineers", "Partnering with product on roadmaps"],
};

const YEARS: Record<string, string> = { junior: "1–3", mid: "3–5", senior: "5–8", lead: "8+", director: "10+" };

export interface Universe {
  jobs: Job[];
  bySource: Record<string, Job[]>;
}

let cached: Universe | null = null;

export function getUniverse(): Universe {
  if (cached) return cached;
  const rand = prng(20260917);
  const now = Date.now();
  const jobs: Job[] = [];
  const bySource: Record<string, Job[]> = Object.fromEntries(JOB_SOURCES.map((s) => [s.id, []]));

  // Featured roles keep stable ids so seeded applications/activity can reference them.
  const featured: Partial<Job>[] = [
    { id: "job_google_pm", title: "Product Manager", company: "Google", location: "Bengaluru, India", workMode: "hybrid", salaryMin: 2_800_000, salaryMax: 4_500_000, seniority: "mid", postedAt: new Date(now - 2 * DAY).toISOString(), tags: ["Leadership", "Growth"], skills: ["Product Strategy", "Roadmapping", "User Research", "A/B Testing", "Analytics", "Stakeholder Management"], onEmployerSite: true, repostCount: 0 },
    { id: "job_microsoft_spm", title: "Senior Product Manager", company: "Microsoft", location: "Hyderabad, India", workMode: "remote", salaryMin: 3_000_000, salaryMax: 5_000_000, seniority: "senior", postedAt: new Date(now - 3 * DAY).toISOString(), tags: ["Strategy", "AI"], skills: ["Product Strategy", "Roadmapping", "Prioritization", "Metrics", "PRDs", "Go-to-Market"], onEmployerSite: true, repostCount: 0 },
    { id: "job_amazon_growth", title: "Product Manager, Growth", company: "Amazon", location: "Bengaluru, India", workMode: "onsite", salaryMin: 2_800_000, salaryMax: 4_500_000, seniority: "mid", postedAt: new Date(now - 4 * DAY).toISOString(), tags: ["Growth", "Analytics"], skills: ["A/B Testing", "Analytics", "Experimentation", "Metrics", "SQL", "Retention"], onEmployerSite: true, repostCount: 0 },
    { id: "job_meta_pm", title: "Product Manager", company: "Meta", location: "Remote, India", workMode: "remote", salaryMin: 3_500_000, salaryMax: 5_500_000, seniority: "senior", postedAt: new Date(now - 9 * DAY).toISOString(), tags: ["Consumer", "AI"] },
    { id: "job_airbnb_pm", title: "Product Manager", company: "Airbnb", location: "Remote, India", workMode: "remote", salaryMin: 3_200_000, salaryMax: 5_200_000, seniority: "mid", postedAt: new Date(now - 8 * DAY).toISOString(), tags: ["Consumer", "Growth"] },
    { id: "job_razorpay_spm", title: "Senior Product Manager, Platform", company: "Razorpay", location: "Bengaluru, India", workMode: "hybrid", salaryMin: 3_200_000, salaryMax: 4_800_000, seniority: "senior", postedAt: new Date(now - 1 * DAY).toISOString(), tags: ["Platform", "B2B"] },
  ];

  const makeJob = (base: Partial<Job>, idx: number): Omit<Job, "id" | "sourceId" | "externalId"> & { id?: string } => {
    const t = base.title ? TITLES.find((x) => x.title === base.title)! : weightedPick(rand, TITLES);
    const company = base.company ? COMPANIES.find((c) => c.name === base.company)! : rand.pick(COMPANIES);
    const loc = base.location ? LOCATIONS.find((l) => l.city === base.location)! : weightedPick(rand, LOCATIONS);
    const workMode = base.workMode ?? (loc.city.startsWith("Remote") ? "remote" : rand.pick(["hybrid", "hybrid", "onsite", "remote"] as const));
    const baseSalary = { junior: 1_200_000, mid: 2_400_000, senior: 3_200_000, lead: 4_500_000, director: 6_500_000 }[t.seniority];
    const hasSalary = base.salaryMin != null || rand.chance(0.62);
    const salaryMin = base.salaryMin ?? (hasSalary ? Math.round((baseSalary * (0.85 + rand.next() * 0.3)) / 100_000) * 100_000 : undefined);
    const salaryMax = base.salaryMax ?? (hasSalary && salaryMin ? Math.round((salaryMin * (1.35 + rand.next() * 0.3)) / 100_000) * 100_000 : undefined);
    const currency = loc.country === "IN" ? "INR" : loc.country === "GB" ? "GBP" : "USD";
    const skillPool = SKILLS[t.track];
    const skills = base.skills ?? rand.sample(skillPool, Math.min(skillPool.length, rand.int(4, 7)));
    const posted = base.postedAt ?? new Date(now - rand.int(0, 45) * DAY - rand.int(0, 23) * 3_600_000).toISOString();
    const onEmployerSite = base.onEmployerSite ?? rand.chance(0.7);
    const applyPath = onEmployerSite ? "employer_site" : rand.chance(0.8) ? "platform" : rand.chance(0.5) ? "email" : "unknown";
    const reqs = REQ_BY_TRACK[t.track];
    const years = YEARS[t.seniority];
    return {
      id: base.id,
      title: t.title,
      company: company.name,
      companyDomain: company.domain,
      location: loc.city,
      country: loc.country,
      workMode,
      salaryMin: currency === "INR" ? salaryMin : salaryMin ? Math.round(salaryMin / 30) : undefined,
      salaryMax: currency === "INR" ? salaryMax : salaryMax ? Math.round(salaryMax / 30) : undefined,
      currency,
      postedAt: posted,
      observedAt: new Date(now - rand.int(0, 12) * 3_600_000).toISOString(),
      description: describe(t.title, company.name, t.track),
      requirements: [`${years} ${reqs[0]}`, ...reqs.slice(1, 1 + rand.int(2, reqs.length - 1))],
      niceToHave: rand.sample(["Experience in " + company.industry.toLowerCase(), "MBA or equivalent", "Startup experience", "Experience with AI/ML products", "Fluency in multiple markets"], 2),
      skills,
      seniority: t.seniority,
      industry: company.industry,
      applyUrl: onEmployerSite ? `https://careers.${company.domain}/jobs/${1000 + idx}` : `https://jobs.example/${idx}`,
      applyPath,
      onEmployerSite,
      repostCount: base.repostCount ?? (rand.chance(0.15) ? rand.int(1, 3) : 0),
      tags: base.tags ?? rand.sample(TAGS_BY_TRACK[t.track], 2),
    };
  };

  const canonicalCount = 1124;
  let idx = 0;
  const add = (canon: ReturnType<typeof makeJob>, sourceCount: number, stableId?: string) => {
    const srcs = rand.sample(JOB_SOURCES, sourceCount);
    srcs.forEach((s, i) => {
      const id = stableId && i === 0 ? stableId : `job_${hashKey(`${canon.title}|${canon.company}|${canon.location}|${s.id}|${idx}`)}`;
      const job: Job = { ...canon, id, sourceId: s.id, externalId: `${s.short}-${100000 + idx * 7 + i}` };
      // Cross-posted copies drift slightly so dedupe has real work to do.
      if (i > 0) {
        job.observedAt = new Date(new Date(canon.observedAt).getTime() - i * 3_600_000).toISOString();
        if (rand.chance(0.3)) job.title = job.title.replace("Senior ", "Sr. ");
      }
      jobs.push(job);
      bySource[s.id].push(job);
    });
    idx++;
  };

  featured.forEach((f) => add(makeJob(f, idx), 2, f.id));
  for (let i = featured.length; i < canonicalCount; i++) {
    const sourceCount = rand.chance(0.45) ? 1 : rand.chance(0.7) ? 2 : 3;
    add(makeJob({}, idx), sourceCount);
  }
  cached = { jobs, bySource };
  return cached;
}
