/**
 * Sign-in connections (WJ-316): the candidate's accounts on employer application portals, kept by WonderJobs so
 * the cloud browser can sign in — or create the account — when a background fill reaches a portal's sign-in page.
 * What a client ever sees: the portal, the email, a masked password, who made it and how it last went.
 */
export type ConnectionStatus = "active" | "needs_verification" | "failed";
export type ConnectionCreator = "candidate" | "wonder";

export interface PortalConnection {
  id: string;
  /** The portal's own host, e.g. amgen.wd1.myworkdayjobs.com — each Workday employer is its own account. */
  host: string;
  provider?: string;
  email: string;
  /** Never the password: "••••••••" plus its last two characters at most. */
  masked: string;
  status: ConnectionStatus;
  createdBy: ConnectionCreator;
  createdAt: string;
  lastUsedAt?: string;
  /** How the last sign-in went, in plain words ("Signed in", "Amgen asked to verify your email"). */
  lastResult?: string;
}

/** A portal host as connections key it: lowercase, no port. */
export function portalHost(urlOrHost: string): string | null {
  try {
    const h = (/^https?:\/\//i.test(urlOrHost) ? new URL(urlOrHost).hostname : urlOrHost).toLowerCase().replace(/\.$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : null;
  } catch {
    return null;
  }
}
