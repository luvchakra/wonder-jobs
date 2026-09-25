/** Seed state for the mock backend: one candidate ("Alex Morgan") with realistic history. */
import type { Application } from "@/domain/applications/types";
import type { ActivityItem, CareerDNA, CareerInsight, Notification, UpcomingItem } from "@/domain/career/types";
import type { Workflow, WorkflowSchedule } from "@/domain/workflow/types";
import { JOB_SOURCES } from "./catalog";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = () => Date.now();
const ago = (ms: number) => new Date(now() - ms).toISOString();
const ahead = (ms: number) => new Date(now() + ms).toISOString();

export const SEED_DNA: CareerDNA = {
  name: "Alex Morgan",
  headline: "Product Manager · Consumer & Fintech",
  careerGoal: "Find product management roles in tech companies",
  yearsExperience: 5,
  seniority: "mid",
  skills: [
    { name: "Product Strategy", level: 4 },
    { name: "Roadmapping", level: 5 },
    { name: "User Research", level: 4 },
    { name: "A/B Testing", level: 4 },
    { name: "SQL", level: 3 },
    { name: "Analytics", level: 4 },
    { name: "Stakeholder Management", level: 4 },
    { name: "Go-to-Market", level: 3 },
    { name: "Prioritization", level: 5 },
    { name: "Experimentation", level: 4 },
    { name: "Metrics", level: 4 },
    { name: "PRDs", level: 5 },
  ],
  industries: ["Technology", "Fintech", "Consumer", "E-commerce"],
  preferredLocations: ["Bengaluru", "Remote"],
  workModes: ["hybrid", "remote"],
  minSalary: 2_800_000,
  currency: "INR",
  strengths: ["Turning ambiguous problems into crisp roadmaps", "Data-informed prioritization", "Cross-functional influence"],
  growthAreas: ["Platform / API products", "People management"],
  // Demo only: a synthetic history so the résumé templates have something to render. Never shown to a real account.
  history: {
    contact: { email: "alex.morgan@example.com", phone: "+91 90000 00000", location: "Bengaluru, India", linkedinUrl: "https://www.linkedin.com/in/example-alex-morgan" },
    summary: "Product manager with five years in consumer fintech and e-commerce. Turns ambiguous problems into clear roadmaps, runs disciplined experiments and works closely with engineering and design.",
    experience: [
      {
        id: "exp_demo_1",
        employer: "Northwind Payments (sample)",
        title: "Product Manager, Consumer Payments",
        location: "Bengaluru, India",
        startDate: "2022-04",
        current: true,
        bullets: [
          { id: "b_d1", text: "Own the roadmap for the consumer payments app across onboarding, payments and rewards", provenance: "USER_PROVIDED" },
          { id: "b_d2", text: "Run weekly A/B tests with the growth team and share results in a monthly review", provenance: "USER_PROVIDED" },
          { id: "b_d3", text: "Wrote PRDs and ran quarterly planning with engineering, design and compliance", provenance: "USER_PROVIDED" },
        ],
        provenance: "USER_PROVIDED",
      },
      {
        id: "exp_demo_2",
        employer: "Contoso Retail (sample)",
        title: "Associate Product Manager",
        location: "Mumbai, India",
        startDate: "2020-01",
        endDate: "2022-03",
        bullets: [
          { id: "b_d4", text: "Shipped the new checkout flow with the payments and logistics teams", provenance: "USER_PROVIDED" },
          { id: "b_d5", text: "Built the SQL dashboards the product team used for weekly metrics reviews", provenance: "USER_PROVIDED" },
        ],
        provenance: "USER_PROVIDED",
      },
    ],
    education: [{ id: "edu_demo_1", institution: "Sample Institute of Technology", degree: "B.Tech.", field: "Computer Science", location: "Pune, India", startDate: "2015", endDate: "2019", provenance: "USER_PROVIDED" }],
    certifications: [{ id: "cert_demo_1", name: "Product Analytics Certification (sample)", issuer: "Example Academy", issueDate: "2023-06", provenance: "USER_PROVIDED" }],
    projects: [],
    publications: [],
    researchInterests: [],
  },
  updatedAt: ago(12 * DAY),
};

const DEMO_PACK_TEXT = {
  resume: "ALEX MORGAN — Product Manager\n\nSample demo résumé tailored for Senior Product Manager, Platform at Razorpay.\n\n• Led roadmap for a consumer payments product used by millions of customers\n• Ran A/B tests that lifted activation\n• Partnered with engineering and design on quarterly planning",
  cover_letter: "Dear Razorpay hiring team,\n\nThis is a sample demo cover letter. I'm excited about the Senior Product Manager, Platform role and the chance to bring my payments and experimentation experience to your platform team.\n\nBest,\nAlex Morgan",
  answers: "Why Razorpay? (sample demo answer)\nI've built consumer fintech products and want to work on the platform that powers them.",
} as const;

export function seedApplications(): Application[] {
  const mk = (id: string, jobId: string, status: Application["status"], createdDaysAgo: number, extra: Partial<Application> = {}): Application => ({
    id,
    jobId,
    status,
    createdAt: ago(createdDaysAgo * DAY),
    artifacts: [],
    events: [],
    followUps: [],
    submissionKey: `submit:${jobId}:alex`,
    ...extra,
  });
  const apps: Application[] = [
    mk("app_google", "job_google_pm", "submitted", 2, {
      appliedAt: ago(2 * DAY),
      nextAction: "Follow up with recruiter",
      followUpAt: ahead(1 * DAY),
      events: [
        { id: "ev1", applicationId: "app_google", type: "discovered", at: ago(3 * DAY), title: "Job discovered", detail: "Found on Jobicy and the company career site" },
        { id: "ev2", applicationId: "app_google", type: "prepared", at: ago(2 * DAY + 5 * HOUR), title: "Application prepared", detail: "Resume tailored, cover letter drafted" },
        { id: "ev3", applicationId: "app_google", type: "submitted", at: ago(2 * DAY), title: "Submitted", detail: "Via employer career site" },
      ],
      followUps: [{ id: "fu1", applicationId: "app_google", dueAt: ahead(1 * DAY), kind: "follow_up", note: "Check in with recruiter about timeline", done: false }],
    }),
    mk("app_microsoft", "job_microsoft_spm", "under_review", 5, {
      appliedAt: ago(5 * DAY),
      nextAction: "Wait for recruiter response",
      followUpAt: ahead(2 * DAY),
      events: [
        { id: "ev4", applicationId: "app_microsoft", type: "discovered", at: ago(6 * DAY), title: "Job discovered" },
        { id: "ev5", applicationId: "app_microsoft", type: "submitted", at: ago(5 * DAY), title: "Submitted" },
        { id: "ev6", applicationId: "app_microsoft", type: "recruiter_response", at: ago(3 * DAY), title: "Recruiter response", detail: "Application under review by hiring team" },
      ],
      followUps: [{ id: "fu2", applicationId: "app_microsoft", dueAt: ahead(2 * DAY), kind: "follow_up", note: "Follow up if no update", done: false }],
    }),
    mk("app_amazon", "job_amazon_growth", "interview", 7, {
      appliedAt: ago(7 * DAY),
      nextAction: "Prepare for interview tomorrow, 10:00 AM",
      followUpAt: ahead(1 * DAY),
      events: [
        { id: "ev7", applicationId: "app_amazon", type: "submitted", at: ago(7 * DAY), title: "Submitted" },
        { id: "ev8", applicationId: "app_amazon", type: "recruiter_response", at: ago(4 * DAY), title: "Recruiter screen", detail: "30-minute call completed" },
        { id: "ev9", applicationId: "app_amazon", type: "interview", at: ahead(1 * DAY), title: "Interview scheduled", detail: "Hiring manager round" },
      ],
      followUps: [{ id: "fu3", applicationId: "app_amazon", dueAt: ahead(1 * DAY), kind: "interview", note: "Hiring manager interview", done: false }],
    }),
    mk("app_meta", "job_meta_pm", "preparing", 1, { nextAction: "Finish tailoring resume", events: [{ id: "ev10", applicationId: "app_meta", type: "saved", at: ago(1 * DAY), title: "Saved" }] }),
    mk("app_airbnb", "job_airbnb_pm", "saved", 7, { nextAction: "Prepare application", events: [{ id: "ev11", applicationId: "app_airbnb", type: "saved", at: ago(7 * DAY), title: "Saved" }] }),
    mk("app_razorpay", "job_razorpay_spm", "ready_for_review", 1, {
      nextAction: "Review tailored materials",
      // Demo only: a "ready for review" pack must actually contain materials, or the Application Pack
      // summary (correctly) reports nothing prepared while Home says materials are ready.
      artifacts: (["resume", "cover_letter", "answers"] as const).map((type) => ({
        id: `art_razorpay_${type}`,
        applicationId: "app_razorpay",
        type,
        currentVersionId: `ver_razorpay_${type}`,
        versions: [{ id: `ver_razorpay_${type}`, createdAt: ago(20 * HOUR), provenance: "AI_GENERATED" as const, note: "Sample demo draft", content: DEMO_PACK_TEXT[type] }],
      })),
      events: [
        { id: "ev12", applicationId: "app_razorpay", type: "discovered", at: ago(1 * DAY), title: "Job discovered" },
        { id: "ev13", applicationId: "app_razorpay", type: "prepared", at: ago(20 * HOUR), title: "Application prepared" },
      ],
    }),
  ];
  return apps;
}

export function seedActivity(): ActivityItem[] {
  return [
    { id: "act1", at: ago(2 * HOUR), kind: "search_completed", title: "Job search completed", subtitle: "142 new matches", href: "/app/runs" },
    { id: "act2", at: ago(5 * HOUR), kind: "resume_tailored", title: "Resume tailored", subtitle: "Product Manager @ Google", href: "/app/applications/app_google" },
    { id: "act3", at: ago(1 * DAY), kind: "application_prepared", title: "Application prepared", subtitle: "Senior Product Manager @ Microsoft", href: "/app/applications/app_microsoft" },
    { id: "act4", at: ago(2 * DAY), kind: "job_saved", title: "Job saved", subtitle: "Growth Product Manager @ Amazon", href: "/app/jobs/job_amazon_growth" },
  ];
}

export function seedUpcoming(): UpcomingItem[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const nextRun = new Date();
  nextRun.setDate(nextRun.getDate() + 1);
  nextRun.setHours(8, 0, 0, 0);
  return [
    { id: "up1", at: tomorrow.toISOString(), kind: "interview", title: "Interview", subtitle: "Google – Product Manager", href: "/app/applications/app_amazon" },
    { id: "up2", at: ahead(2 * DAY), kind: "follow_up", title: "Follow up", subtitle: "Microsoft – Sr PM", href: "/app/applications/app_microsoft" },
    { id: "up3", at: nextRun.toISOString(), kind: "scheduled_run", title: "Scheduled Run", subtitle: "Tech Leadership Search", href: "/app/automation/scheduled" },
  ];
}

export function seedInsights(): CareerInsight[] {
  return [
    {
      id: "ins1",
      title: "Interview rate",
      body: "Your interview rate is 3.2× higher in product roles than last month.",
      metric: { label: "Interview rate", value: "3.2×", delta: "vs last month" },
      series: [2, 3, 2, 4, 3, 6, 7],
      suggestion: { text: "Wonder suggests narrowing your search to senior product roles. Would you like to update your preferences?", href: "/app/career-dna" },
    },
    { id: "ins2", title: "Strongest signal", body: "Roles that mention experimentation and analytics match you most consistently.", series: [4, 5, 5, 6, 7, 7, 8] },
    { id: "ins3", title: "Response time", body: "Employers that reply do so within 6 days on average. Follow-ups after day 5 lifted responses by 18%.", metric: { label: "Median reply", value: "6 days" } },
  ];
}

export function seedNotifications(): Notification[] {
  return [
    { id: "n1", at: ago(2 * HOUR), category: "strong_opportunity", title: "3 new strong matches", body: "Google, Microsoft and Razorpay posted roles that fit your Career Profile.", href: "/app/jobs?fit=strong", read: false },
    { id: "n2", at: ago(1 * DAY), category: "interview_upcoming", title: "Interview tomorrow at 10:00 AM", body: "Amazon — Product Manager, Growth. Wonder prepared a prep sheet.", href: "/app/applications/app_amazon", read: false },
    { id: "n3", at: ago(1 * DAY), category: "follow_up_due", title: "Follow-up due tomorrow", body: "Google — Product Manager. Draft is ready for your review.", href: "/app/applications/app_google", read: true },
  ];
}

export function seedWorkflows(): Workflow[] {
  const at = ago(20 * DAY);
  return [
    {
      id: "wf_tech_leadership",
      name: "Job Search — Tech Leadership (Daily)",
      description: "Daily discovery of product leadership roles across all sources.",
      version: 3,
      template: "daily_discovery",
      config: {
        careerGoal: SEED_DNA.careerGoal,
        automationLevel: "guided",
        provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
        sourceIds: JOB_SOURCES.map((s) => s.id),
        searchCriteria: { query: "product manager", locations: ["Bengaluru", "Remote"], workModes: ["hybrid", "remote"], minSalary: 2_800_000 },
        minMatchThreshold: 70,
        maxResults: 50,
        notify: "strong_matches_only",
      },
      stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank"],
      createdAt: at,
      updatedAt: ago(3 * DAY),
    },
  ];
}

export function seedSchedules(): WorkflowSchedule[] {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return [
    {
      id: "sch_daily",
      workflowId: "wf_tech_leadership",
      name: "Daily Job Discovery",
      description: "Search → Deduplicate → Analyze → Match → Rank, every weekday at 8:00 AM.",
      enabled: true,
      trigger: "schedule",
      frequency: "weekdays",
      days: [1, 2, 3, 4, 5],
      time: "08:00",
      timezone: "Asia/Kolkata",
      condition: { key: "strong_matches", op: ">", value: 0 },
      actions: ["notify"],
      lastRunAt: ago(1 * DAY + 2 * HOUR),
      nextRunAt: next.toISOString(),
      createdAt: ago(20 * DAY),
    },
  ];
}
