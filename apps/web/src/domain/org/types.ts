import type { InternshipTerms } from "./internship";
import type { ScreeningQuestion } from "./screening";
/**
 * Employers and recruiters (owner, 2026-10-20). Everyone is a job seeker; a person may also belong to a company's
 * hiring workspace (an organization) in one role. What each role may do is `permissions.ts` — the one place that
 * decides it, enforced on the server for every request.
 */
export type OrgRole = "owner" | "hiring_manager" | "recruiter";

export const ORG_ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", hiring_manager: "Hiring manager", recruiter: "Recruiter" };
export const ORG_ROLE_HELP: Record<OrgRole, string> = {
  owner: "Everything, including the team and roles.",
  hiring_manager: "Posts and edits jobs, reads recruiters' reports and decides on candidates.",
  recruiter: "Finds candidates, shortlists and messages them, and reports them to hiring managers.",
};

export interface Organization {
  id: string;
  name: string;
  website?: string;
  /** Set by WonderJobs once the company is checked; until then its jobs say "Unverified employer". */
  verified: boolean;
  createdAt: string;
}

export interface Membership {
  orgId: string;
  tenantId: string;
  role: OrgRole;
  email?: string;
  name?: string;
  joinedAt: string;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: string;
}

export type EmployerJobStatus = "draft" | "open" | "closed";

export interface EmployerJob {
  id: string;
  orgId: string;
  title: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  jobType?: "full_time" | "part_time" | "contract" | "internship" | "temporary" | "gig";
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  description: string;
  skills: string[];
  /** Where a candidate applies: the employer's own page or an email address. */
  applyUrl: string;
  /** Questions every applicant answers (Easy Apply and career sites); none when empty. */
  screening: ScreeningQuestion[];
  /** An internship's duration and start date (domain/org/internship.ts); only for jobType "internship". */
  internship?: InternshipTerms;
  status: EmployerJobStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What a job seeker chose to show recruiters, and nothing else from their account. */
export interface TalentProfile {
  tenantId: string;
  /** First name and last initial only. */
  displayName: string;
  headline: string;
  seniority: string;
  yearsExperience: number;
  skills: string[];
  locations: string[];
  workModes: string[];
  summary: string;
  updatedAt: string;
}

export type ShortlistStatus = "shortlisted" | "reported" | "interview" | "passed";
export const SHORTLIST_STATUS_LABEL: Record<ShortlistStatus, string> = { shortlisted: "Shortlisted", reported: "Reported to hiring managers", interview: "Interview", passed: "Passed" };

export interface ShortlistEntry {
  id: string;
  orgId: string;
  candidateTenant: string;
  /** The job they're shortlisted for, when there is one. */
  jobId?: string;
  note: string;
  status: ShortlistStatus;
  addedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ConversationStatus = "open" | "declined" | "blocked";

export interface Conversation {
  id: string;
  orgId: string;
  candidateTenant: string;
  jobId?: string;
  status: ConversationStatus;
  startedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderTenant: string;
  side: "org" | "candidate";
  body: string;
  createdAt: string;
}
