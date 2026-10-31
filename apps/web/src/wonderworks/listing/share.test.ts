import { describe, expect, it } from "vitest";
import { absoluteUrl, emailHref, excerpt, listingShareMessage, publicPath, whatsappHref } from "./share";

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

  it("carries every labelled detail and the description, not just the headline: what the listing shows at the moment of sharing", () => {
    const m = listingShareMessage(
      { noun: "internship", title: "React Intern", facts: ["Acme", "Pune", "₹10,000 a month"], lines: ["Duration: 3 months", false, "Skills: React, SQL", 0, "Apply by: 30 Nov 2026"], details: "Build the dashboard.\nWork with the design team.", url: "x" },
      "https://x.test/s/internships/ws_1",
    );
    for (const part of ["*React Intern*", "Acme · Pune · ₹10,000 a month", "Duration: 3 months", "Skills: React, SQL", "Apply by: 30 Nov 2026", "Build the dashboard.", "Work with the design team."]) expect(m.whatsapp).toContain(part);
    expect(m.whatsapp).not.toContain("false");
    expect(m.body).toContain("Skills: React, SQL");
    expect(m.text).toContain("Duration: 3 months");
    expect(m.whatsapp.split("\n").at(-1)).toBe("https://x.test/s/internships/ws_1");
  });

  it("a long description is cut at a word, with an ellipsis, and a short one is kept whole", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const e = excerpt(long, 100);
    expect(e.length).toBeLessThanOrEqual(101);
    expect(e.endsWith("…")).toBe(true);
    // Cut at a word: the last thing before the ellipsis is a whole word of the original.
    expect(long.split(" ")).toContain(e.slice(0, -1).split(" ").pop());
    expect(excerpt("Short and sweet.", 100)).toBe("Short and sweet.");
    expect(excerpt(undefined)).toBe("");
  });

  it("a listing's public page is /s/<module>/<id>, encoded", () => {
    expect(publicPath("events", "ws_a b")).toBe("/s/events/ws_a%20b");
  });
});
