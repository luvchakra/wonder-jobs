import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactPanel } from "./components/Contact";
import { CONTACT_LABEL, CONTACT_STAGE, cleanPhone, isContactStatus, telHref, type TherapistListing } from "./domain";

const practice = (over: Partial<TherapistListing> = {}): TherapistListing => ({ id: "node/1", origin: "outside", title: "Calm Minds Counselling Centre", company: "Calm Minds Counselling Centre", location: "Pune", terms: { currency: "INR", modes: ["in_person"] }, description: "Counselling practice in Pune. Listed on OpenStreetMap.", sourceId: "thp_osm", sourceName: "OpenStreetMap", practiceKind: "Counselling practice", mapUrl: "https://www.openstreetmap.org/node/1", applyUrl: "https://www.openstreetmap.org/node/1", attribution: "© OpenStreetMap contributors", ...over });
const render = (l: TherapistListing) => renderToStaticMarkup(createElement(ContactPanel, { listing: l }));

describe("how to reach a mapped practice (the details page's one main action)", () => {
  it("is a real link, never a script: the phone when the map has one, then its website and OpenStreetMap page", () => {
    const out = render(practice({ phone: "+91 20 1234 5678", applyUrl: "https://calmminds.example.in" }));
    // The main action is an anchor; the only button is the quiet "I've contacted them".
    expect(out).toMatch(/^<div[^>]*><a /);
    expect(out).not.toContain("window.open");
    expect(out).toContain('href="tel:+912012345678"');
    expect(out).toContain("Call +91 20 1234 5678");
    expect(out).toContain('href="https://calmminds.example.in"');
    expect(out).toContain('href="https://www.openstreetmap.org/node/1"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("with no phone the main action is its own website, named for what it opens", () => {
    const out = render(practice({ applyUrl: "https://www.calmminds.example.in/contact" }));
    expect(out).toMatch(/^<div[^>]*><a [^>]*href="https:\/\/www\.calmminds\.example\.in\/contact"/);
    expect(out).toContain("Open calmminds.example.in");
    expect(out).not.toContain("tel:");
  });

  it("with only its OpenStreetMap page, the button says so; nothing is made up", () => {
    const out = render(practice());
    expect(out).toContain("View on OpenStreetMap");
    expect(out).not.toMatch(/tel:|mailto:|Call /);
    expect(out).toContain("can&#x27;t book a session with them");
  });

  it("offers to note it as contacted, and doesn't claim anything was sent", () => {
    const out = render(practice());
    expect(out).toContain("I&#x27;ve contacted them");
    expect(out).not.toMatch(/sent|booked for you/i);
  });
});

describe("phone numbers and the contacted record", () => {
  it("keeps the first plausible number the map gives, and drops anything else", () => {
    expect(cleanPhone("+91 20 1234 5678")).toBe("+91 20 1234 5678");
    expect(cleanPhone("020-2345 6789; +91 98765 43210")).toBe("020-2345 6789");
    expect(cleanPhone("call me")).toBeUndefined();
    expect(cleanPhone("12345")).toBeUndefined();
    expect(cleanPhone("javascript:alert(1)")).toBeUndefined();
    expect(cleanPhone(undefined)).toBeUndefined();
    expect(telHref("+91 (20) 1234-5678")).toBe("tel:+912012345678");
  });

  it("each way a contact can stand has a label and a Sessions stage", () => {
    expect(Object.keys(CONTACT_LABEL)).toEqual(["contacted", "booked", "no_reply", "not_a_fit"]);
    expect(CONTACT_STAGE).toEqual({ contacted: "contacted", booked: "upcoming", no_reply: "held_closed", not_a_fit: "held_closed" });
    expect(isContactStatus("booked")).toBe(true);
    expect(isContactStatus("requested")).toBe(false);
    expect(isContactStatus(undefined)).toBe(false);
  });
});
