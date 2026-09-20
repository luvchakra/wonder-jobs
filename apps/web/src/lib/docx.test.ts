import { describe, expect, it } from "vitest";
import { buildDocxBytes } from "./docx";
import { extractDocxText, readZipEntries } from "@/server/resume/extractText";

const RESUME_MD = ["# Kunal Chakraborty", "Senior Staff Software Engineer", "", "## Summary", "", "21+ years building **fintech and platform** products.", "", "## Core strengths", "", "- Platform strategy", "- Stakeholder alignment", "", "---", "", "## Experience", "", "[Add your recent roles here.]"].join("\n");

describe("buildDocxBytes", () => {
  it("produces a ZIP with the required OOXML parts", () => {
    const bytes = buildDocxBytes(RESUME_MD);
    const names = readZipEntries(Buffer.from(bytes)).map((e) => e.name);
    expect(names).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml", "word/numbering.xml"]);
  });

  it("carries the heading text, bold run and bullets through to a real extraction of the file", () => {
    const bytes = buildDocxBytes(RESUME_MD);
    const extracted = extractDocxText(Buffer.from(bytes));
    expect(extracted).toContain("Kunal Chakraborty");
    expect(extracted).toContain("Senior Staff Software Engineer");
    expect(extracted).toContain("fintech and platform");
    expect(extracted).toContain("Platform strategy");
    expect(extracted).toContain("Stakeholder alignment");
  });

  it("marks a bold run with <w:b/> in the document XML, and escapes special characters", () => {
    const bytes = buildDocxBytes("A **bold** claim with <angle> & \"quotes\".");
    const xml = Buffer.from(bytes).toString("latin1");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("&lt;angle&gt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;quotes&quot;");
    // The raw text must never appear unescaped — that would be invalid XML and could break the document.
    expect(xml).not.toContain("<angle>");
  });

  it("produces a non-trivial, well-formed file for an empty document", () => {
    const bytes = buildDocxBytes("");
    expect(() => readZipEntries(Buffer.from(bytes))).not.toThrow();
    expect(bytes.length).toBeGreaterThan(0);
  });
});
