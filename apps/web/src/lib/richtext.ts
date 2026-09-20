/**
 * Minimal, dependency-free conversion between the plain-markdown-ish text
 * `ArtifactVersion.content` is stored as (the AI writes `#`/`##` headings,
 * `**bold**`, `- ` bullets and `---` rules — see `services/ai/service.ts`)
 * and the HTML a contentEditable rich-text surface needs. Only the subset
 * those templates actually produce is handled; anything else round-trips
 * as a plain paragraph rather than being dropped.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

/** Renders stored markdown as HTML for display and as a contentEditable's initial content. */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = [];
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join("<br>")}</p>`);
      para = [];
    }
  };
  for (const line of lines) {
    if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h3) {
      flushPara();
      flushList();
      out.push(`<h3>${inlineMarkdown(h3[1])}</h3>`);
      continue;
    }
    if (h2) {
      flushPara();
      flushList();
      out.push(`<h2>${inlineMarkdown(h2[1])}</h2>`);
      continue;
    }
    if (h1) {
      flushPara();
      flushList();
      out.push(`<h1>${inlineMarkdown(h1[1])}</h1>`);
      continue;
    }
    if (li) {
      flushPara();
      list.push(`<li>${inlineMarkdown(li[1])}</li>`);
      continue;
    }
    flushList();
    para.push(inlineMarkdown(line));
  }
  flushPara();
  flushList();
  return out.join("");
}

/**
 * A DOM node has this shape (`Node`/`Element`), so a real contentEditable
 * element satisfies it structurally; tests build plain objects with the
 * same shape instead of pulling in a DOM implementation.
 */
export interface DomLikeNode {
  nodeType: number;
  tagName?: string;
  textContent?: string | null;
  childNodes?: ArrayLike<DomLikeNode>;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function childArray(node: DomLikeNode): DomLikeNode[] {
  return node.childNodes ? Array.from(node.childNodes) : [];
}

function inlineText(node: DomLikeNode): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== ELEMENT_NODE) return "";
  const tag = (node.tagName ?? "").toUpperCase();
  if (tag === "BR") return "\n";
  const inner = childArray(node).map(inlineText).join("");
  if (tag === "STRONG" || tag === "B") return inner.trim() ? `**${inner}**` : inner;
  if (tag === "EM" || tag === "I") return inner.trim() ? `*${inner}*` : inner;
  return inner;
}

/** Reads a contentEditable root's live DOM back into the same markdown flavor `markdownToHtml` renders. */
export function htmlToMarkdown(root: DomLikeNode): string {
  const lines: string[] = [];
  let listBuffer: string[] = [];
  const flushList = () => {
    if (listBuffer.length) {
      lines.push(listBuffer.join("\n"));
      listBuffer = [];
    }
  };
  for (const node of childArray(root)) {
    if (node.nodeType === TEXT_NODE) {
      const text = (node.textContent ?? "").trim();
      if (text) {
        flushList();
        lines.push(text);
      }
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const tag = (node.tagName ?? "").toUpperCase();
    if (tag === "UL" || tag === "OL") {
      flushList();
      for (const li of childArray(node)) {
        if ((li.tagName ?? "").toUpperCase() !== "LI") continue;
        const text = inlineText(li).trim();
        if (text) listBuffer.push(`- ${text}`);
      }
      flushList();
      continue;
    }
    if (tag === "LI") {
      const text = inlineText(node).trim();
      if (text) listBuffer.push(`- ${text}`);
      continue;
    }
    flushList();
    if (tag === "HR") {
      lines.push("---");
      continue;
    }
    if (tag === "BR") continue;
    if (tag === "H1" || tag === "H2" || tag === "H3") {
      const text = inlineText(node).trim();
      if (text) lines.push(`${"#".repeat(Number(tag[1]))} ${text}`);
      continue;
    }
    // P, DIV and anything else contentEditable might wrap a line in: one paragraph, internal <br>s kept as soft breaks.
    const text = inlineText(node).trim();
    if (text) lines.push(text);
  }
  flushList();
  return lines.join("\n\n");
}
