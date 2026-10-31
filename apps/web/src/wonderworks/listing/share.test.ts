import { describe, expect, it } from "vitest";
import { absoluteUrl, emailHref, listingShareMessage, whatsappHref } from "./share";

describe("sharing a listing", () => {
  it("a message carries the title, the public facts and the link, last and alone on WhatsApp", () => {
    const m = listingShareMessage({ noun: "internship", title: "React Intern", facts: ["Acme", "Pune", null, false, "3 months"], url: "x" }, "https://x.test/p/1");
    expect(m.subject).toBe("Internship you might like: React Intern");
    expect(m.whatsapp.split("\n").at(-1)).toBe("https://x.test/p/1");
    expect(m.whatsapp).toContain("*React Intern*");
    expect(m.body).toContain("Acme · Pune · 3 months");
    expect(m.body).toContain("https://x.test/p/1");
    expect(m.text).not.toContain("https://");
  });

  it("with no facts there is no empty line of them (people-facing modules share the title and the link only)", () => {
    const m = listingShareMessage({ noun: "practitioner", title: "Counselling for work stress", url: "x" }, "https://x.test/app/m/therapists");
    expect(m.whatsapp).toBe(["*Counselling for work stress*", "", "Thought of you for this one. Found with WonderWorks.", "", "https://x.test/app/m/therapists"].join("\n"));
  });

  it("a path becomes a link on this site's own address; an outside link is kept as it is", () => {
    expect(absoluteUrl("https://x.test/", "/app/m/events")).toBe("https://x.test/app/m/events");
    expect(absoluteUrl("https://x.test", "app/m/events")).toBe("https://x.test/app/m/events");
    expect(absoluteUrl("https://x.test", "https://boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });

  it("the email and WhatsApp links encode the message", () => {
    const m = listingShareMessage({ noun: "event", title: "A & B", url: "x" }, "https://x.test");
    expect(emailHref(m)).toBe(`mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`);
    expect(whatsappHref(m)).toBe(`https://wa.me/?text=${encodeURIComponent(m.whatsapp)}`);
  });
});
