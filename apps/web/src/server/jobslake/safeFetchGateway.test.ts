import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handle = vi.fn();
vi.mock("@/server/gateway", () => ({ hostedGateway: () => ({ gateway: { handle: (...a: unknown[]) => handle(...a) }, store: { flush: async () => undefined } }) }));
const netFetch = vi.fn();

import { safeFetch } from "./safeFetch";

beforeEach(() => {
  vi.stubEnv("WORKSLAKE_GATEWAY_URL", "https://works.wonderapps.biz");
  handle.mockReset();
  netFetch.mockReset();
  vi.stubGlobal("fetch", netFetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("safeFetch answers calls to the app's own data gateway in process (2026-11-02: 508 Loop Detected)", () => {
  it("sends a /v1 call on the gateway's own origin to the gateway in process, with its headers, never over the network", async () => {
    handle.mockResolvedValue(new Response(JSON.stringify({ items: [{ id: "1" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await safeFetch("https://works.wonderapps.biz/v1/workslake/events/listings?q=", { headers: { Authorization: "Bearer k" } });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ items: [{ id: "1" }] });
    const req = handle.mock.calls[0][0] as Request;
    expect(req.url).toBe("https://works.wonderapps.biz/v1/workslake/events/listings?q=");
    expect(req.headers.get("authorization")).toBe("Bearer k");
    expect(netFetch).not.toHaveBeenCalled();
  });

  it("leaves every other URL to the network (another origin, or not under /v1/)", async () => {
    netFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    await safeFetch("https://works.wonderapps.biz/api/other").catch(() => undefined);
    await safeFetch("https://example.com/v1/workslake/x").catch(() => undefined);
    expect(handle).not.toHaveBeenCalled();
  });

  it("does nothing special when no gateway URL is configured", async () => {
    vi.stubEnv("WORKSLAKE_GATEWAY_URL", "");
    netFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    await safeFetch("https://works.wonderapps.biz/v1/workslake/x").catch(() => undefined);
    expect(handle).not.toHaveBeenCalled();
  });
});
