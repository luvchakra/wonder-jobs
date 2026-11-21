import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests, table } from "../db/table";
import { cleanEmail, cleanPhone, maskEmail, maskPhone } from "@/domain/contact/contact";
import { contactView, eraseContact, exportContact, offerContact, withdrawContact } from "./exchange";

beforeEach(() => resetTablesForTests());

describe("masking and checks", () => {
  it("masks enough to recognise, not to use", () => {
    expect(maskPhone("+91 98765 43210")).toBe("+9198•••••210");
    expect(maskPhone("020 7946 0958")).toBe("02••••••958");
    expect(maskEmail("kunal@gmail.com")).toBe("ku•••@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
  });
  it("accepts phone numbers and emails as people write them, nothing else", () => {
    expect(cleanPhone("+91 (98765) 43-210")).toBe("+91 (98765) 43-210");
    for (const bad of ["12345", "call me", "+91 98765 43210 ext 9 9 9 9", "<script>"]) expect(cleanPhone(bad)).toBeNull();
    expect(cleanEmail(" Kunal@Gmail.com ")).toBe("kunal@gmail.com");
    for (const bad of ["kunal", "a@b", "a b@c.com"]) expect(cleanEmail(bad)).toBeNull();
  });
});

describe("the exchange: masked until both share", () => {
  const A = "u-a";
  const B = "u-b";
  it("masked to the other until they share theirs; then both in full; stopping masks again", async () => {
    expect(await contactView("network", "nc_1", A, B)).toEqual({ mine: null, theirs: null });
    await offerContact("network", "nc_1", A, B, { phone: "+91 98765 43210", email: "a@example.com" });
    // Nothing readable is stored.
    const stored = JSON.stringify(await table("contact_exchanges").find({ subject_id: "nc_1" }));
    expect(stored).not.toMatch(/98765|a@example/);
    expect(await contactView("network", "nc_1", B, A)).toEqual({ mine: null, theirs: { phone: "+9198•••••210", email: "a•••@example.com", masked: true } });
    expect((await contactView("network", "nc_1", A, B)).mine).toEqual({ phone: "+91 98765 43210", email: "a@example.com" });
    const after = await offerContact("network", "nc_1", B, A, { email: "b@example.com" });
    expect(after.theirs).toEqual({ phone: "+91 98765 43210", email: "a@example.com", masked: false });
    expect((await contactView("network", "nc_1", A, B)).theirs).toEqual({ email: "b@example.com", masked: false });
    await withdrawContact("network", "nc_1", B);
    expect((await contactView("network", "nc_1", B, A)).theirs?.masked).toBe(true);
    expect((await contactView("network", "nc_1", A, B)).theirs).toBeNull();
  });

  it("an offer is for one person in one conversation only", async () => {
    await offerContact("network", "nc_1", A, B, { email: "a@example.com" });
    expect((await contactView("network", "nc_1", "u-c", A)).theirs).toBeNull();
    expect((await contactView("network", "nc_2", B, A)).theirs).toBeNull();
    expect((await contactView("cofounders", "nc_1", B, A)).theirs).toBeNull();
  });

  it("refuses an empty or malformed offer", async () => {
    await expect(offerContact("network", "nc_1", A, B, {})).rejects.toThrow(/Choose a phone/);
    await expect(offerContact("network", "nc_1", A, B, { phone: "123" })).rejects.toThrow(/phone number/);
    await expect(offerContact("network", "nc_1", A, B, { email: "nope" })).rejects.toThrow(/email address/);
    await expect(offerContact("network", "nc_1", A, A, { email: "a@example.com" })).rejects.toThrow(/someone else/);
  });

  it("export holds the person's own offers; erasure removes theirs and those made to them", async () => {
    await offerContact("network", "nc_1", A, B, { email: "a@example.com" });
    await offerContact("network", "nc_1", B, A, { phone: "+44 20 7946 0958" });
    expect(await exportContact(A)).toMatchObject({ offers: [{ module: "network", conversation: "nc_1", email: "a@example.com" }] });
    await eraseContact(A);
    expect(await table("contact_exchanges").find({ subject_id: "nc_1" })).toEqual([]);
  });
});
