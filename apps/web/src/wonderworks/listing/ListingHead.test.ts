import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingHead } from "./ListingPage";

const facts = [createElement("span", { key: "w" }, "14 Nov 2026"), createElement("span", { key: "p" }, "Espoo")];

describe("the listing head", () => {
  it("shows the company line above the facts by default, falling back to the company's name", () => {
    const html = renderToStaticMarkup(createElement(ListingHead, { company: "Rootconf", facts }));
    expect(html).toContain("Rootconf");
    expect(html).toContain("14 Nov 2026");
    expect(renderToStaticMarkup(createElement(ListingHead, { company: "Rootconf", name: "Rootconf (Bengaluru)", facts }))).toContain("Rootconf (Bengaluru)");
  });

  it("hideName leaves no company line, so a listing with no organiser shows its facts, never a stand-in name", () => {
    const html = renderToStaticMarkup(createElement(ListingHead, { company: "Library hour", hideName: true, facts }));
    expect(html).not.toContain("text-[15px]");
    expect(html).toContain("14 Nov 2026");
    expect(html).toContain("Espoo");
  });

  it("an icon takes the logo's place, with no company initial", () => {
    const html = renderToStaticMarkup(createElement(ListingHead, { company: "Gardens", hideName: true, icon: createElement("svg", { "data-testid": "cal" }), facts }));
    expect(html).toContain('data-testid="cal"');
    expect(html).toContain("size-10");
  });
});
