/**
 * Starts the collection workflow on GitHub from the admin's Import now / Import this module (owner, 2026-11-06: the
 * collection runs on the GitHub Actions runner, not on Vercel). Needs GITHUB_DISPATCH_TOKEN on the deployment: a
 * fine-grained token with Actions read and write on the repository; nothing else. Without it, the route runs the import
 * on the site as before. The token never leaves the server.
 */
export const DEFAULT_DISPATCH_REPO = "luvchakra/wonder-jobs";
const WORKFLOW_FILE = "gateway-collect.yml";

import { withPlatformKeys } from "@/server/jobslake/platformKeys";

type Env = Record<string, string | undefined>;

/** The token comes from the deployment or Admin → Settings → Platform keys (callers load the store first, `loadPlatformKeys`). */
export function runnerDispatchConfigured(env: Env = withPlatformKeys()): boolean {
  return !!env.GITHUB_DISPATCH_TOKEN?.trim();
}

export interface DispatchInputs {
  mode: "all" | "module";
  module?: string;
  /** Who pressed it (shown on Sources → Import as the run's "by"). */
  by: string;
}

export async function dispatchCollection(inputs: DispatchInputs, fetcher: typeof fetch = fetch, env: Env = withPlatformKeys()): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) return { ok: false, message: "The collection runner isn't set up on this deployment (GITHUB_DISPATCH_TOKEN)." };
  const repo = env.GITHUB_DISPATCH_REPO?.trim() || DEFAULT_DISPATCH_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { ok: false, message: "GITHUB_DISPATCH_REPO must be owner/repo." };
  const ref = env.GITHUB_DISPATCH_REF?.trim() || "main";
  try {
    const res = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28" },
      body: JSON.stringify({ ref, inputs: { mode: inputs.mode, module: inputs.module ?? "", by: inputs.by.slice(0, 120) } }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (res.status === 204) return { ok: true };
    console.error(`[gateway] workflow dispatch → ${res.status}`);
    return { ok: false, message: `GitHub refused to start the collection (${res.status}). Check GITHUB_DISPATCH_TOKEN's permissions.` };
  } catch (e) {
    return { ok: false, message: `GitHub couldn't be reached to start the collection (${e instanceof Error ? e.message.slice(0, 60) : "error"}).` };
  }
}
