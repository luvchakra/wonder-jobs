import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { getSource } from "./registry";
import { listAllSourceViews, listSourceViews } from "./views";

describe("the admin Sources list covers every module", () => {
  it("lists other modules' sources with their module, while the Jobs list stays Jobs-only", async () => {
    const all = await listAllSourceViews();
    const teaching = all.find((s) => s.id === "teach_himalayas");
    expect(teaching?.moduleLabel).toBe("Teaching");
    expect(all.find((s) => s.id === "remotive")?.moduleLabel).toBe("Jobs");
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect((await listSourceViews()).some((s) => s.id === "teach_himalayas")).toBe(false);
  });

  it("finds a source by id in whichever module it belongs to", async () => {
    expect((await getSource("teach_himalayas"))?.id).toBe("teach_himalayas");
    expect((await getSource("remotive"))?.id).toBe("remotive");
    expect(await getSource("no_such_source")).toBeUndefined();
  });
});
