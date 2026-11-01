import { describe, expect, it } from "vitest";
import { sourceLine } from "./JobCard";

const sighted = (...names: string[]) => ({ sourceIds: [], lake: { sightings: names.map((sourceName, i) => ({ sourceId: `s${i}`, sourceName })) } }) as unknown as Parameters<typeof sourceLine>[0];

describe("sourceLine", () => {
  it("names the WorksLake Data Gateway WWDG on the card, keeping the full name otherwise", () => {
    const job = sighted("WorksLake Data Gateway · Jobs");
    expect(sourceLine(job, true)).toBe("WWDG");
    expect(sourceLine(job)).toBe("WorksLake Data Gateway · Jobs");
  });

  it("keeps the count of other sources when the gateway comes first", () => {
    expect(sourceLine(sighted("WorksLake Data Gateway · Jobs", "Greenhouse"), true)).toBe("WWDG +1");
  });

  it("leaves other sources' names as they are", () => {
    expect(sourceLine(sighted("Greenhouse", "Lever"), true)).toBe("Greenhouse +1");
  });
});
