import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CofounderCard } from "./Listing";
import type { CofounderListing } from "../domain";

const base = { company: "Hacker News", location: "", description: "Payments for small shops.", postedAt: "2026-11-03T00:00:00Z", sourceId: "cof_outside", sourceName: "Hacker News" };
const noop = () => undefined;
const card = (item: CofounderListing) => renderToStaticMarkup(createElement(CofounderCard, { item, onOpen: noop }));

describe("a card for a post or a startup", () => {
  it("a post: labelled Post, the author's public handle, the source and date; Save only — no Connect, no Join", () => {
    const l: CofounderListing = { ...base, id: "cofounders_p", kind: "post", title: "Looking for a technical co-founder", terms: { handle: "raj" }, url: "https://news.ycombinator.com/item?id=1", shareable: true };
    const html = card(l);
    expect(html).toContain("Looking for a technical co-founder");
    expect(html).toContain(">Post<");
    expect(html).toContain("@raj");
    expect(html).toContain("via Hacker News");
    expect(html).not.toMatch(/>Connect<|>Join<|Ask to join/);
  });

  it("a startup: labelled New startup, its batch, size and place; no fit pill and no Connect", () => {
    const l: CofounderListing = { ...base, id: "cofounders_s", kind: "startup", title: "Ledgerly", company: "Fintech ledgers", location: "Bengaluru, India", terms: { batch: "Summer 2026", teamSize: 4, hiring: true }, sourceName: "Y Combinator", url: "https://www.ycombinator.com/companies/ledgerly", shareable: true };
    const html = card(l);
    expect(html).toContain("Ledgerly");
    expect(html).toContain("New startup");
    expect(html).toContain("Summer 2026");
    expect(html).toContain("4 people");
    expect(html).toContain("Hiring");
    expect(html).not.toMatch(/>Connect<|>Join<|Fits/);
  });

  it("a person still has Connect, and a team Join", () => {
    const person: CofounderListing = { id: "cfp_1", kind: "person", title: "Backend engineer", company: "Looking for a co-founder", location: "Pune", terms: { role: "Tech" }, description: "", sourceId: "cof_wonderworks", sourceName: "WonderWorks founders" };
    expect(card(person)).toContain(">Connect<");
    expect(card({ ...person, id: "cft_1", kind: "team" })).toContain(">Join<");
  });
});
