import { describe, expect, it } from "vitest";
import { sheetLine } from "./ShareButton";

describe("the share sheet's line", () => {
  it("is the title and two short facts, never the title twice or a full address", () => {
    expect(sheetLine("Sindhi Polyclinic", ["Sindhi Polyclinic", "Kolkata", "In person", "₹500"])).toBe("Sindhi Polyclinic · Kolkata · In person");
    const line = sheetLine("Acrylic Painting Date - Mumbai", ["7 Nov 2026", "1, Windsor Corporate Park, Andheri Link Rd, Oshiwara, Goregaon West, Mumbai", "SOCIAL SAILOR ENTERTAINMENT LLP"]);
    expect(line).toBe("Acrylic Painting Date - Mumbai · 7 Nov 2026 · 1, Windsor Corporate Park, Andh…");
  });
});
