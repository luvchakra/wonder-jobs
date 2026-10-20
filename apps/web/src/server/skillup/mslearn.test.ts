import { describe, expect, it } from "vitest";
import { certificationNamed, forSkill, parseCatalog, titleMatches, type LearnItem } from "./mslearn";

const items: LearnItem[] = parseCatalog(
  {
    certifications: [
      { title: "Microsoft Certified: Azure Administrator Associate", subtitle: "<p>You manage <b>Azure</b>&nbsp;subscriptions.</p>", url: "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/?WT.mc_id=api_CatalogApi", levels: ["intermediate"] },
      { title: "Microsoft Certified: Security Operations Analyst Associate", url: "https://learn.microsoft.com/en-us/credentials/certifications/security-operations-analyst/?WT.mc_id=api_CatalogApi" },
      { title: "No address" },
    ],
  },
  {
    learningPaths: [
      { title: "Get started with Azure Kubernetes Service", summary: "Run containers.", url: "https://learn.microsoft.com/en-us/training/paths/aks/?WT.mc_id=api_CatalogApi", duration_in_minutes: 120, levels: ["beginner"] },
      { title: "Explore Python basics", url: "https://learn.microsoft.com/en-us/training/paths/python/?WT.mc_id=api_CatalogApi" },
    ],
  },
);

describe("Microsoft Learn catalog", () => {
  it("keeps the entries that have a title and an address, as plain text without the tracking parameter", () => {
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ kind: "certification", summary: "You manage Azure subscriptions.", url: "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/", level: "intermediate" });
    expect(items[2]).toMatchObject({ kind: "learning path", minutes: 120 });
  });

  it("matches a skill on titles that are about it, whole words only", () => {
    expect(titleMatches("Explore Python basics", "Python")).toBe(true);
    expect(titleMatches("Explore Pythonic basics", "Python")).toBe(false);
    expect(titleMatches("Get started with Azure Kubernetes Service", "kubernetes azure")).toBe(true);
    expect(titleMatches("Anything", "")).toBe(false);
  });

  it("lists certifications before learning paths for a skill", () => {
    expect(forSkill(items, "Azure").map((i) => i.kind)).toEqual(["certification", "learning path"]);
    expect(forSkill(items, "Rust")).toEqual([]);
    expect(forSkill(items, "Azure", 1)).toHaveLength(1);
  });

  it("finds the Microsoft certification a posting names, and only Microsoft's", () => {
    expect(certificationNamed(items, "Microsoft Certified: Azure Administrator Associate")?.title).toContain("Azure Administrator");
    expect(certificationNamed(items, "Microsoft Certified: Azure Administrator")?.title).toContain("Azure Administrator");
    expect(certificationNamed(items, "Microsoft Certified: Quantum Wizard")).toBeNull();
    expect(certificationNamed(items, "AWS Certified: Solutions Architect")).toBeNull();
  });
});
