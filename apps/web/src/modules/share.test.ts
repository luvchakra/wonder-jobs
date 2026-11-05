import { describe, expect, it } from "vitest";
import { shareOf as internships } from "./internships/share";
import { shareOf as teaching } from "./teaching/share";
import { shareOf as services } from "./services/share";
import { shareOf as therapists } from "./therapists/share";
import { shareOf as events } from "./events/share";
import { shareOf as marketplace } from "./marketplace/share";
import { shareOf as cofounders } from "./cofounders/share";
import type { CofounderListing } from "./cofounders/domain";

const base = { company: "Acme", location: "Pune, Maharashtra", sourceId: "s", sourceName: "WonderWorks X", description: "The full description of the thing." };
/** What a share is made from: the details its image shows and its summary is written from (the message itself is crisp). */
const text = (p: object) => JSON.stringify(p);

/** What each module's Share is made from — every field its listing shows, never a generic line — and what it never says. */
describe("every module's Share carries the listing's own details", () => {
  it("Internships: stipend, duration, start, last day, schedule, skills, source, description", () => {
    const m = text(internships({ ...base, id: "ws_1", origin: "wonderstar", title: "Marketing Intern", workMode: "hybrid", terms: { currency: "INR", stipendMin: 10000, durationMonths: 3, startsOn: "2026-12-01", applyBy: "2026-11-20", schedule: "full_time" }, termsFrom: "company", skills: ["SEO", "Copy"] }));
    for (const x of ["Marketing Intern", "Acme", "Duration: 3 months", "Starts: 1 Dec 2026", "Apply by: 20 Nov 2026", "Schedule: Full time", "Skills: SEO, Copy", "From: WonderWorks X", "The full description of the thing."]) expect(m).toContain(x);
    expect(internships({ ...base, id: "ws_1", origin: "wonderstar", title: "t", terms: { currency: "INR" }, termsFrom: "company", skills: [] }).url).toBe("/s/internships/ws_1");
  });

  it("Teaching: subject, grades, boards, pay, requirements, demo class", () => {
    const m = text(teaching({ ...base, id: "ws_2", origin: "wonderstar", title: "Maths Teacher", terms: { currency: "INR", subject: "Maths", grades: ["secondary"], boards: ["CBSE"], hours: "full_time", payMin: 40000, payPer: "month", requires: ["B.Ed"], demo: true }, termsFrom: "company" } as never));
    for (const x of ["Maths Teacher", "Subject: Maths", "Boards: CBSE", "Requires: B.Ed", "A demo class is part of hiring", "Full time"]) expect(m).toContain(x);
  });

  it("Services: price, kind, areas, visit charge, warranty, rating and finished jobs", () => {
    const m = text(services({ ...base, id: "ws_3", origin: "wonderstar", title: "AC repair", terms: { currency: "INR", lane: "local", priceKind: "from", priceMin: 499, areas: ["Thane"], visitCharge: 0, materials: "extra", warrantyDays: 30, rating: 4.8, reviews: 12, completed: 40, onTimePct: 95, gst: true }, termsFrom: "company" } as never));
    for (const x of ["AC repair", "Areas: Thane", "Free visit", "Materials extra", "30-day warranty", "Rating: 4.8 (12 reviews)", "Jobs finished: 40 · 95% on time", "GST registered"]) expect(m).toContain(x);
  });

  it("Therapists: fee, session length, languages, focus, ways of working — what the practitioner published", () => {
    const m = text(therapists({ ...base, id: "ws_4", postingId: "4", origin: "wonderworks", title: "Counselling for work stress", workMode: "hybrid", terms: { currency: "INR", modes: ["online", "in_person"], languages: ["English", "Hindi"], focus: ["Stress & anxiety"], approaches: ["CBT"], feeMin: 4000, feeMax: 5000, sessionMinutes: 60 } }));
    for (const x of ["Counselling for work stress", "Session: 60 min", "Languages: English, Hindi", "Focus: Stress & anxiety", "Ways of working: CBT", "₹4,000"]) expect(m).toContain(x);
    expect(therapists({ ...base, id: "ws_4", origin: "wonderworks", postingId: "4", title: "t", terms: { currency: "INR" } }).url).toBe("/s/therapists/ws_4");
  });

  it("Events: when, where, who, seats right now, age, tags", () => {
    const m = text(events({ ...base, id: "ws_5", postingId: "5", title: "Open mic night", terms: { startsAt: "2026-12-05T13:30:00.000Z", online: false, capacity: 40, ageMin: 18, tags: ["Music", "Social"] }, seatsLeft: 12, waitlisted: 0 }));
    for (const x of ["Open mic night", "Seats: 12 of 40 seats left", "Age: 18+", "Tags: Music, Social", "Pune, Maharashtra"]) expect(m).toContain(x);
    // The place is carried once, as the place chip: a separate "Where" line is only for a longer address the chip had to cut.
    expect(m).not.toContain("Where: Pune, Maharashtra");
  });

  it("Marketplace: price, condition, category and area — never the seller", () => {
    const l = { ...base, id: "mk_6", listingId: "6", title: "Television Toshiba", area: "Thane", terms: { category: "Electronics", price: 8000, negotiable: true, condition: "Like new", photos: ["p1"] }, sellerVerified: true, seller: "Asha" } as never;
    const m = text(marketplace(l));
    for (const x of ["Television Toshiba", "₹8,000 · negotiable", "Like new", "Category: Electronics", "Area: Thane", "The full description of the thing."]) expect(m).toContain(x);
    expect(m).not.toContain("Asha");
    expect(JSON.stringify(marketplace(l))).not.toContain("p1");
  });

  it("Co-founders: a profile shares content only when its owner allowed it; otherwise a generic message, whatever the listing holds", () => {
    const listing: CofounderListing = { id: "cfp_1", kind: "person", title: "Product-minded engineer", company: "Founder", location: "Mumbai", terms: { role: "Tech", skills: ["React", "Node"], commitment: "Full time", idea: "Fintech for gig workers", equity: "Open to discuss" }, description: "I have built two products.", sourceId: "s", sourceName: "WonderWorks founders" };
    const on = cofounders({ ...listing, shareable: true });
    const m = text(on);
    for (const x of ["Product-minded engineer", "Tech founder", "Skills: React, Node", "Idea: Fintech for gig workers", "Equity: Open to discuss", "I have built two products."]) expect(m).toContain(x);
    expect(on.url).toBe("/app/m/cofounders");
    // Off, missing (an older saved copy) or anything but true: nothing about the person leaves.
    for (const l of [{ ...listing, shareable: false }, listing, { ...listing, shareable: "yes" as never }]) {
      const off = cofounders(l);
      const t = JSON.stringify(off);
      for (const x of ["Product-minded", "engineer", "Mumbai", "React", "Node", "Fintech", "Open to discuss", "two products", "Tech founder", "Full time", "WonderWorks founders"]) expect(t, x).not.toContain(x);
      expect(off).toMatchObject({ title: "Co-founders on WonderWorks", url: "/app/m/cofounders" });
      expect(off.lines).toEqual([]);
      expect(off.details).toBeUndefined();
    }
    // A team follows the same rule.
    const team: CofounderListing = { id: "cft_1", kind: "team", title: "Chaser", company: "Invoices that chase themselves", location: "Pune", terms: { stage: "Prototype", founders: 2, openRoles: [{ role: "Business", skills: ["Sales"] }] }, description: "A longer story.", sourceId: "s", sourceName: "WonderWorks founders" };
    expect(text(cofounders({ ...team, shareable: true }))).toContain("Looking for: Business (Sales)");
    expect(JSON.stringify(cofounders(team))).not.toMatch(/Chaser|Invoices|Pune|Sales/);
  });
});
