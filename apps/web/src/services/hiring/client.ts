import type { Conversation, EmployerJob, Membership, Message, OrgInvite, OrgRole, Organization, ShortlistEntry, ShortlistStatus, TalentProfile } from "@/domain/org/types";

/** Browser calls to the hiring routes. The server decides every permission; these only carry the request. */
async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export interface Workspace {
  org: Organization;
  role: OrgRole;
}
export interface TalentMatch {
  profile: TalentProfile;
  score: number;
  matchedSkills: string[];
}
export interface ShortlistView extends ShortlistEntry {
  candidate: TalentProfile | null;
  jobTitle?: string;
}
export interface ConversationView extends Conversation {
  orgName: string;
  candidateName: string;
  jobTitle?: string;
  last?: Message;
}
export type JobInput = Pick<EmployerJob, "title" | "location" | "workMode" | "jobType" | "salaryMin" | "salaryMax" | "currency" | "description" | "skills" | "applyUrl">;

const o = (org: string) => `/api/hiring/${encodeURIComponent(org)}`;

export const hiringApi = {
  workspaces: () => call<{ me: string; workspaces: Workspace[]; invites: (OrgInvite & { orgName: string })[] }>("/api/hiring"),
  create: (name: string, website?: string) => call<Workspace>("/api/hiring", { method: "POST", json: { name, website: website || undefined } }),
  answerInvite: (id: string, action: "accept" | "decline") => call(`/api/hiring/invites/${encodeURIComponent(id)}`, { method: "POST", json: { action } }),
  team: (org: string) => call<{ members: Membership[]; invites: OrgInvite[] }>(`${o(org)}/team`),
  invite: (org: string, email: string, role: OrgRole) => call(`${o(org)}/team`, { method: "POST", json: { email, role } }),
  setRole: (org: string, tenantId: string, role: OrgRole) => call(`${o(org)}/team`, { method: "PATCH", json: { tenantId, role } }),
  removeMember: (org: string, tenantId: string) => call(`${o(org)}/team?tenant=${encodeURIComponent(tenantId)}`, { method: "DELETE" }),
  cancelInvite: (org: string, id: string) => call(`${o(org)}/team?invite=${encodeURIComponent(id)}`, { method: "DELETE" }),
  jobs: (org: string) => call<{ jobs: EmployerJob[] }>(`${o(org)}/jobs`),
  createJob: (org: string, job: JobInput) => call<EmployerJob>(`${o(org)}/jobs`, { method: "POST", json: job }),
  editJob: (org: string, id: string, job: JobInput) => call<EmployerJob>(`${o(org)}/jobs`, { method: "PATCH", json: { id, job } }),
  setJobStatus: (org: string, id: string, status: EmployerJob["status"]) => call(`${o(org)}/jobs`, { method: "PATCH", json: { id, status } }),
  talent: (org: string, q: string, place: string) => call<{ matches: TalentMatch[] }>(`${o(org)}/talent?q=${encodeURIComponent(q)}&place=${encodeURIComponent(place)}`),
  shortlist: (org: string) => call<{ entries: ShortlistView[] }>(`${o(org)}/shortlist`),
  addToShortlist: (org: string, candidate: string, note: string, jobId?: string) => call(`${o(org)}/shortlist`, { method: "POST", json: { candidate, note, jobId } }),
  updateShortlist: (org: string, id: string, patch: { note?: string; status?: ShortlistStatus }) => call(`${o(org)}/shortlist`, { method: "PATCH", json: { id, ...patch } }),
  removeFromShortlist: (org: string, id: string) => call(`${o(org)}/shortlist?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  orgConversations: (org: string) => call<{ conversations: ConversationView[] }>(`${o(org)}/conversations`),
  startConversation: (org: string, candidate: string, body: string, jobId?: string) => call<{ id: string }>(`${o(org)}/conversations`, { method: "POST", json: { candidate, body, jobId } }),
  // The job seeker's side, and threads either side reads.
  myConversations: () => call<{ conversations: ConversationView[] }>("/api/conversations"),
  thread: (id: string, as: "org" | "candidate" = "candidate") => call<{ conversation: ConversationView; messages: Message[]; side: "org" | "candidate"; canSend: boolean }>(`/api/conversations/${encodeURIComponent(id)}?as=${as}`),
  send: (id: string, body: string, as: "org" | "candidate" = "candidate") => call<Message>(`/api/conversations/${encodeURIComponent(id)}?as=${as}`, { method: "POST", json: { body } }),
  setConversationStatus: (id: string, status: Conversation["status"]) => call(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", json: { status } }),
  myProfile: () => call<{ profile: TalentProfile | null }>("/api/talent/me"),
  saveProfile: (p: Omit<TalentProfile, "tenantId" | "updatedAt">) => call<{ profile: TalentProfile }>("/api/talent/me", { method: "PUT", json: p }),
  removeProfile: () => call("/api/talent/me", { method: "DELETE" }),
};
