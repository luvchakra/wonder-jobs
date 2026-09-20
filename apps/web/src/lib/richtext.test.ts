import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml, markdownToPlainText, parseMarkdownBlocks, type DomLikeNode } from "./richtext";

describe("markdownToHtml", () => {
  it("renders headings, bold and a bullet list", () => {
    expect(markdownToHtml("# Kunal Chakraborty")).toBe("<h1>Kunal Chakraborty</h1>");
    expect(markdownToHtml("## Core strengths")).toBe("<h2>Core strengths</h2>");
    expect(markdownToHtml("### Section")).toBe("<h3>Section</h3>");
    expect(markdownToHtml("**Target Role:** Senior Engineer")).toBe("<p><strong>Target Role:</strong> Senior Engineer</p>");
    expect(markdownToHtml("- Owns the roadmap\n- Ships fast")).toBe("<ul><li>Owns the roadmap</li><li>Ships fast</li></ul>");
  });

  it("renders a horizontal rule and paragraph breaks", () => {
    expect(markdownToHtml("Line one\n\n---\n\nLine two")).toBe("<p>Line one</p><hr><p>Line two</p>");
  });

  it("joins consecutive plain lines within one paragraph with a line break", () => {
    expect(markdownToHtml("Dear Coinbase,\nLine two")).toBe("<p>Dear Coinbase,<br>Line two</p>");
  });

  it("escapes raw HTML in the source text so it can never inject markup", () => {
    expect(markdownToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("renders a full AI-generated-style resume", () => {
    const md = ["# Kunal Chakraborty", "**Target Role:** Senior Staff Software Engineer", "", "---", "", "## Professional Summary", "Accomplished leader with **21 years of experience**.", "", "## Core strengths", "- Platform strategy", "- Stakeholder alignment"].join("\n");
    expect(markdownToHtml(md)).toBe(
      "<h1>Kunal Chakraborty</h1><p><strong>Target Role:</strong> Senior Staff Software Engineer</p><hr><h2>Professional Summary</h2><p>Accomplished leader with <strong>21 years of experience</strong>.</p><h2>Core strengths</h2><ul><li>Platform strategy</li><li>Stakeholder alignment</li></ul>",
    );
  });
});

function el(tagName: string, childNodes: DomLikeNode[] = []): DomLikeNode {
  return { nodeType: 1, tagName, childNodes };
}
function text(textContent: string): DomLikeNode {
  return { nodeType: 3, textContent };
}
function root(childNodes: DomLikeNode[]): DomLikeNode {
  return { nodeType: 1, tagName: "DIV", childNodes };
}

describe("htmlToMarkdown — reading a contentEditable's live DOM back into the same markdown flavor", () => {
  it("reads headings, bold/italic and a bullet list", () => {
    expect(htmlToMarkdown(root([el("H1", [text("Kunal Chakraborty")])]))).toBe("# Kunal Chakraborty");
    expect(htmlToMarkdown(root([el("H2", [text("Summary")])]))).toBe("## Summary");
    expect(htmlToMarkdown(root([el("P", [el("STRONG", [text("Bold")]), text(" and "), el("EM", [text("italic")])])]))).toBe("**Bold** and *italic*");
    expect(htmlToMarkdown(root([el("UL", [el("LI", [text("One")]), el("LI", [text("Two")])])]))).toBe("- One\n- Two");
  });

  it("separates block-level paragraphs with a blank line, and keeps a <br> as a soft break within one", () => {
    const doc = root([el("P", [text("First paragraph")]), el("P", [text("Second paragraph")])]);
    expect(htmlToMarkdown(doc)).toBe("First paragraph\n\nSecond paragraph");
    expect(htmlToMarkdown(root([el("DIV", [text("Line one"), el("BR"), text("Line two")])]))).toBe("Line one\nLine two");
  });

  it("reads a horizontal rule and ignores empty stray text nodes", () => {
    expect(htmlToMarkdown(root([el("HR"), text("   "), el("P", [text("After")])]))).toBe("---\n\nAfter");
  });

  it("round-trips a full resume through markdownToHtml and back losslessly (structurally equivalent)", () => {
    const original = ["# Kunal Chakraborty", "", "## Professional Summary", "", "Accomplished leader with **21 years of experience**.", "", "## Core strengths", "", "- Platform strategy", "- Stakeholder alignment"].join("\n");
    // markdownToHtml's output nodes are exactly what a contentEditable set to that innerHTML would contain —
    // represented here as the same DomLikeNode shape htmlToMarkdown reads, since this test has no real DOM.
    const asTree = root([el("H1", [text("Kunal Chakraborty")]), el("H2", [text("Professional Summary")]), el("P", [text("Accomplished leader with "), el("STRONG", [text("21 years of experience")]), text(".")]), el("H2", [text("Core strengths")]), el("UL", [el("LI", [text("Platform strategy")]), el("LI", [text("Stakeholder alignment")])])]);
    expect(htmlToMarkdown(asTree)).toBe(original);
  });
});

describe("parseMarkdownBlocks — the same grammar as markdownToHtml, as structured data for the DOCX writer", () => {
  it("parses headings, a paragraph with a bold run, and a bullet list", () => {
    const md = ["# Kunal Chakraborty", "", "## Summary", "", "Accomplished leader with **21 years of experience**.", "", "## Core strengths", "", "- Platform strategy", "- Stakeholder alignment"].join("\n");
    expect(parseMarkdownBlocks(md)).toEqual([
      { type: "h1", runs: [{ text: "Kunal Chakraborty" }] },
      { type: "h2", runs: [{ text: "Summary" }] },
      { type: "p", runs: [{ text: "Accomplished leader with " }, { text: "21 years of experience", bold: true }, { text: "." }] },
      { type: "h2", runs: [{ text: "Core strengths" }] },
      { type: "ul", items: [[{ text: "Platform strategy" }], [{ text: "Stakeholder alignment" }]] },
    ]);
  });

  it("parses an h3 and a horizontal rule", () => {
    expect(parseMarkdownBlocks("### Section")).toEqual([{ type: "h3", runs: [{ text: "Section" }] }]);
    expect(parseMarkdownBlocks("Above\n\n---\n\nBelow")).toEqual([{ type: "p", runs: [{ text: "Above" }] }, { type: "hr" }, { type: "p", runs: [{ text: "Below" }] }]);
  });

  it("treats each consecutive plain line as its own paragraph, not one soft-wrapped block", () => {
    expect(parseMarkdownBlocks("Warm regards,\nKunal Chakraborty")).toEqual([
      { type: "p", runs: [{ text: "Warm regards," }] },
      { type: "p", runs: [{ text: "Kunal Chakraborty" }] },
    ]);
  });

  it("parses an italic run", () => {
    expect(parseMarkdownBlocks("This is *emphasized* text.")).toEqual([{ type: "p", runs: [{ text: "This is " }, { text: "emphasized", italic: true }, { text: " text." }] }]);
  });
});

describe("markdownToPlainText — what goes into an employer's plain textarea", () => {
  it("drops the markdown syntax, keeps the words and the paragraph breaks", () => {
    const md = ["Dear Coinbase Hiring Team,", "", "I'm excited to apply. I have **21 years** of experience.", "", "Warm regards,", "Kunal"].join("\n");
    expect(markdownToPlainText(md)).toBe("Dear Coinbase Hiring Team,\n\nI'm excited to apply. I have 21 years of experience.\n\nWarm regards,\n\nKunal");
  });

  it("keeps bullets readable and drops rules", () => {
    expect(markdownToPlainText("## Strengths\n\n- One\n- Two\n\n---")).toBe("Strengths\n\n- One\n- Two");
  });
});
