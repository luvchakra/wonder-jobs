import { describe, expect, it, vi } from "vitest";
import { dispatchCollection, runnerDispatchConfigured } from "./dispatch";

describe("dispatching the collection workflow from Import now", () => {
  it("isn't configured without the token, and then nothing is sent", async () => {
    expect(runnerDispatchConfigured({})).toBe(false);
    const fetcher = vi.fn();
    const r = await dispatchCollection({ mode: "all", by: "admin@x" }, fetcher as never, {});
    expect(r.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("starts the workflow on the repository with the mode, module and who pressed it; the token only in the header", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const env = { GITHUB_DISPATCH_TOKEN: "ghp_secret", GITHUB_DISPATCH_REPO: "owner/repo" };
    expect(runnerDispatchConfigured(env)).toBe(true);
    const r = await dispatchCollection({ mode: "module", module: "events", by: "admin@x" }, fetcher as never, env);
    expect(r).toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/actions/workflows/gateway-collect.yml/dispatches");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghp_secret");
    expect(JSON.parse(String(init.body))).toEqual({ ref: "main", inputs: { mode: "module", module: "events", by: "admin@x" } });
    expect(String(init.body)).not.toContain("ghp_secret");
  });

  it("reports a refusal in fixed words, never GitHub's text or the token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: "Bad credentials ghp_secret" }), { status: 401 }));
    const r = await dispatchCollection({ mode: "all", by: "a" }, fetcher as never, { GITHUB_DISPATCH_TOKEN: "ghp_secret" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("ghp_secret");
    expect(JSON.stringify(r)).toContain("401");
  });
});
