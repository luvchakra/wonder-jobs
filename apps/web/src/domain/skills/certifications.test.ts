import { describe, expect, it } from "vitest";
import { certificationsAsked, certificationsIn, type CertJob } from "./certifications";
import { LEARN_PLATFORMS, searchTerm } from "./learn";

const job = (id: string, text: string): CertJob => ({ id, title: `Role ${id}`, company: `Co ${id}`, skills: [], text });

describe("certificationsIn", () => {
  it("finds credentials the posting names, and only those", () => {
    expect(certificationsIn("CISSP or CISM preferred. Strong communication.")).toEqual(["CISSP (Certified Information Systems Security Professional)", "CISM (Certified Information Security Manager)"]);
    expect(certificationsIn("We value project management and security awareness.")).toEqual([]);
  });

  it("reads '<vendor> Certified: <role>'", () => {
    expect(certificationsIn("Holds Microsoft Certified: Agentic AI Business Solutions Architect Expert AB-100 Needed")).toEqual(["Microsoft Certified: Agentic AI Business Solutions Architect Expert"]);
    expect(certificationsIn("AWS Certified Solutions Architect - Associate required.")).toEqual(["AWS Certified: Solutions Architect - Associate"]);
  });

  it("does not take short words for credentials", () => {
    expect(certificationsIn("Lower the cost per action. cissp pmp itil are not names.")).toEqual([]);
    expect(certificationsIn("Security awareness, security+ cost")).toEqual([]);
  });
});

describe("certificationsAsked", () => {
  it("counts the postings that ask for each, most-asked first", () => {
    const jobs = [job("1", "PMP required"), job("2", "PMP, ITIL"), job("3", "ITIL")  , job("4", "PMP")];
    const r = certificationsAsked(jobs);
    expect(r.map((c) => [c.name.split(" ")[0], c.jobs])).toEqual([["PMP", 3], ["ITIL", 2]]);
    expect(r[0].examples).toHaveLength(3);
  });

  it("leaves out what the candidate already holds", () => {
    const jobs = [job("1", "PMP required"), job("2", "CISSP")];
    expect(certificationsAsked(jobs, ["PMP"]).map((c) => c.name.split(" ")[0])).toEqual(["CISSP"]);
    expect(certificationsAsked(jobs, ["Project Management Professional (PMP)"]).map((c) => c.name.split(" ")[0])).toEqual(["CISSP"]);
  });
});

describe("learn links", () => {
  it("searches each platform for the exact term", () => {
    const hrefs = Object.fromEntries(LEARN_PLATFORMS.map((p) => [p.id, p.href("C++ & Rust")]));
    expect(hrefs.coursera).toBe("https://www.coursera.org/search?query=C%2B%2B%20%26%20Rust");
    expect(hrefs.udemy).toContain("q=C%2B%2B%20%26%20Rust");
    expect(hrefs.youtube).toContain("C%2B%2B%20%26%20Rust%20course");
  });

  it("searches a credential by its short name", () => {
    expect(searchTerm("CISSP (Certified Information Systems Security Professional)")).toBe("CISSP");
    expect(searchTerm("Microsoft Certified: Azure Administrator Associate")).toBe("Microsoft Certified: Azure Administrator Associate");
  });
});
