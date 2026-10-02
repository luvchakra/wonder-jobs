import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load(env: Record<string, string>, response: unknown, ok = true) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: ok ? 200 : 500 }));
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("./browser");
  return { oauthProviderEnabled: mod.oauthProviderEnabled, fetchMock };
}

const ENV = { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" };

describe("oauthProviderEnabled", () => {
  it("reports a provider the project has switched off (so the button never sends people to a raw error page)", async () => {
    const { oauthProviderEnabled, fetchMock } = await load(ENV, { external: { email: true, google: false } });
    expect(await oauthProviderEnabled("google")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://proj.supabase.co/auth/v1/settings", expect.objectContaining({ headers: { apikey: "sb_publishable_x" } }));
  });

  it("reports an enabled provider", async () => {
    const { oauthProviderEnabled } = await load(ENV, { external: { google: true } });
    expect(await oauthProviderEnabled("google")).toBe(true);
  });

  it("returns null (unknown) rather than blocking when the settings can't be read", async () => {
    const { oauthProviderEnabled } = await load(ENV, {}, false);
    expect(await oauthProviderEnabled("google")).toBeNull();
  });
});
