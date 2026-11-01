import { describe, expect, it } from "vitest";
import { shortSourceNames } from "./parts";

describe("source names on cards", () => {
  it("shows the WorksLake Data Gateway as WWDG, with or without its module, and leaves other sources alone", () => {
    expect(shortSourceNames("via WorksLake Data Gateway · Teaching · 2 days ago")).toBe("via WWDG · 2 days ago");
    expect(shortSourceNames("via WorksLake Data Gateway · Events & Social")).toBe("via WWDG");
    expect(shortSourceNames("via Arbeitnow, WorksLake Data Gateway · Jobs · 5 hours ago")).toBe("via Arbeitnow, WWDG · 5 hours ago");
    expect(shortSourceNames("via WorksLake Data Gateway")).toBe("via WWDG");
    expect(shortSourceNames("via Arbeitnow · 5 hours ago")).toBe("via Arbeitnow · 5 hours ago");
  });
});
