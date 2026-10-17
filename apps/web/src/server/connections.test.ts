import { beforeEach, describe, expect, it } from "vitest";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-for-portal-connections-0123456789";

import { connectionFor, credentialFor, generatePassword, listConnections, recordConnectionResult, removeConnection, resetConnectionsForTests, saveConnection } from "./connections";

describe("sign-in connections (WJ-316)", () => {
  beforeEach(() => resetConnectionsForTests());

  it("keeps the password encrypted and never in what a client sees", async () => {
    const c = await saveConnection("t1", { host: "https://amgen.wd1.myworkdayjobs.com/en-US/Careers", email: "priya@example.com", password: "S3cret!pass-word", createdBy: "candidate" });
    expect(c).toMatchObject({ host: "amgen.wd1.myworkdayjobs.com", email: "priya@example.com", status: "active", createdBy: "candidate" });
    expect(JSON.stringify(c)).not.toContain("S3cret");
    expect(JSON.stringify(await listConnections("t1"))).not.toContain("S3cret");
    expect((await credentialFor("t1", "amgen.wd1.myworkdayjobs.com"))?.password).toBe("S3cret!pass-word");
  });

  it("is isolated by tenant: another tenant can't see, use or remove it", async () => {
    const c = await saveConnection("t1", { host: "amgen.wd1.myworkdayjobs.com", email: "priya@example.com", password: "S3cret!pass-word", createdBy: "candidate" });
    expect(await listConnections("t2")).toEqual([]);
    expect(await credentialFor("t2", "amgen.wd1.myworkdayjobs.com")).toBeUndefined();
    expect(await connectionFor("t2", "amgen.wd1.myworkdayjobs.com")).toBeUndefined();
    expect(await removeConnection("t2", c.id)).toBe(false);
    await recordConnectionResult("t2", c.id, "failed", "nope");
    expect((await connectionFor("t1", "amgen.wd1.myworkdayjobs.com"))?.status).toBe("active");
    expect(await removeConnection("t1", c.id)).toBe(true);
    expect(await listConnections("t1")).toEqual([]);
  });

  it("keeps one connection per portal and refuses junk", async () => {
    await saveConnection("t1", { host: "amgen.wd1.myworkdayjobs.com", email: "a@example.com", password: "first-pass-1", createdBy: "candidate" });
    await saveConnection("t1", { host: "AMGEN.wd1.myworkdayjobs.com", email: "b@example.com", password: "second-pass-2", createdBy: "wonder" });
    const all = await listConnections("t1");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ email: "b@example.com", createdBy: "wonder" });
    await expect(saveConnection("t1", { host: "not a host", email: "a@example.com", password: "123456", createdBy: "candidate" })).rejects.toThrow(/portal/);
    await expect(saveConnection("t1", { host: "x.example.com", email: "nope", password: "123456", createdBy: "candidate" })).rejects.toThrow(/email/);
    await expect(saveConnection("t1", { host: "x.example.com", email: "a@example.com", password: "12", createdBy: "candidate" })).rejects.toThrow(/password/);
  });

  it("generates passwords that meet Workday's rules, never the same twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%^*\-_+=]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});
