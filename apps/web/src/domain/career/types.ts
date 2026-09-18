export interface CareerDNA {
  name: string;
  headline: string;
  careerGoal: string;
  yearsExperience: number;
  seniority: "junior" | "mid" | "senior" | "lead" | "director";
  skills: { name: string; level: 1 | 2 | 3 | 4 | 5 }[];
  industries: string[];
  preferredLocations: string[];
  workModes: ("remote" | "hybrid" | "onsite")[];
  minSalary?: number;
  currency: string;
  strengths: string[];
  growthAreas: string[];
  updatedAt: string;
}

/** Industry choices offered in onboarding and the Career DNA editor (postings are classified into the same names). */
export const INDUSTRIES = ["Technology", "Fintech", "Consumer", "E-commerce", "Mobility", "Education", "Gaming", "Travel", "Telecom", "Healthcare", "Media"];

/** A brand-new account before onboarding: nothing invented, everything to be filled by the candidate. */
export const EMPTY_DNA: CareerDNA = {
  name: "",
  headline: "",
  careerGoal: "",
  yearsExperience: 0,
  seniority: "mid",
  skills: [],
  industries: [],
  preferredLocations: [],
  workModes: ["remote", "hybrid", "onsite"],
  currency: "INR",
  strengths: [],
  growthAreas: [],
  updatedAt: new Date(0).toISOString(),
};

export interface ActivityItem {
  id: string;
  at: string;
  kind: "search_completed" | "resume_tailored" | "application_prepared" | "job_saved" | "run_completed" | "interview_scheduled";
  title: string;
  subtitle: string;
  href: string;
}

export interface UpcomingItem {
  id: string;
  at: string;
  kind: "interview" | "follow_up" | "scheduled_run";
  title: string;
  subtitle: string;
  href: string;
}

export interface CareerInsight {
  id: string;
  title: string;
  body: string;
  metric?: { label: string; value: string; delta?: string };
  series?: number[];
  suggestion?: { text: string; href: string };
}

export interface Notification {
  id: string;
  at: string;
  category:
    | "strong_opportunity"
    | "workflow_completed"
    | "workflow_requires_input"
    | "follow_up_due"
    | "interview_upcoming"
    | "provider_issue"
    | "scheduled_run_failed"
    | "application_status";
  title: string;
  body: string;
  href: string;
  read: boolean;
}
