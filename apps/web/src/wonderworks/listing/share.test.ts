import { describe, expect, it } from "vitest";
import { STORY_VERSION, firstSentence, storyPath, absoluteUrl, distinctText, emailHref, excerpt, facebookHref, hashtag, listingShareMessage, publicPath, whatsappHref, xHref, xPost } from "./share";

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

  it("is crisp: title, facts, one hook line and the link; the details go on the image, not in the message", () => {
    const input: Parameters<typeof listingShareMessage>[0] = { noun: "internship", title: "React Intern", facts: ["Acme", "Pune", "₹10,000 a month"], lines: ["Duration: 3 months", false, "Skills: React, SQL", 0, "Apply by: 30 Nov 2026", "From: WorksLake Data Gateway"], details: "Build the dashboard with the design team. More text follows here.", url: "x" };
    const m = listingShareMessage(input, "https://x.test/s/internships/ws_1", { image: true });
    expect(m.whatsapp).toBe(["*React Intern*\nAcme · Pune · ₹10,000 a month", "Build the dashboard with the design team.", "Thought of you for this one. Found with WonderWorks.", "https://x.test/s/internships/ws_1"].join("\n\n"));
    expect(m.whatsapp).not.toMatch(/Duration|Skills|More text|false/);
    // The AI summary's hook replaces the first sentence, and its highlights go in the email (which has no image).
    const s = listingShareMessage(input, "https://x.test/s/internships/ws_1", { image: true, summary: { hook: "A paid React internship in Pune.", highlights: ["3 months", "Apply by 30 Nov"], ai: true } });
    expect(s.whatsapp).toContain("A paid React internship in Pune.");
    expect(s.whatsapp).not.toContain("3 months");
    expect(s.body).toContain("• Apply by 30 Nov");
    // Without an image (people's profiles), the highlights come in the message, never where it came from.
    const n = listingShareMessage(input, "https://x.test/app/m/x");
    expect(n.whatsapp).toContain("• Duration: 3 months");
    expect(n.whatsapp).not.toContain("WorksLake");
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

describe("distinctText", () => {
  it("drops a description that only repeats its title", () => {
    expect(distinctText("Counselling for work related stress", "Counselling for work related stress. Counselling for work related stress")).toBe("");
  });
  it("keeps what adds something, once", () => {
    expect(distinctText("Yoga", "Yoga. Weekend batches. Weekend batches.")).toBe("Weekend batches.");
  });

  it("X gets a short post under 280 with the link added by X; Instagram a caption ending with the link, the hint and hashtags", () => {
    const m = listingShareMessage({ noun: "internship", title: "React Intern", facts: ["Acme", "Pune"], url: "x" }, "https://x.test/s/internships/1");
    expect(m.x).toBe("React Intern\nAcme · Pune\n\nFind yours free on WonderWorks #Internship #WonderWorks");
    expect(m.x).not.toContain("https://");
    expect(xHref(m, "https://x.test/s/internships/1")).toBe(`https://x.com/intent/post?text=${encodeURIComponent(m.x)}&url=${encodeURIComponent("https://x.test/s/internships/1")}`);
    expect(m.caption).toContain("See it: https://x.test/s/internships/1");
    expect(m.caption.split("\n").slice(-2)).toEqual(["Find yours free on WonderWorks.", "#Internship #WonderWorks"]);
    expect(facebookHref("https://x.test/a?b=1")).toBe("https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fx.test%2Fa%3Fb%3D1");
  });

  it("a long title is cut so the X post with its link stays under 280", () => {
    const post = xPost("T".repeat(400), "facts", "end #tag");
    expect(post.length + 24).toBeLessThanOrEqual(280);
    expect(post.endsWith("\n\nend #tag")).toBe(true);
    expect(hashtag("buy sell & rent")).toBe("#BuySellRent");
  });

  it("the share image's link carries the design's version, so a phone never shows a cached old design", () => {
    expect(storyPath("/s/teaching/opp_1")).toBe(`/s/teaching/opp_1/story?v=${STORY_VERSION}`);
  });

  it("the line without a model is a whole sentence that fits, or the first cut at a word, never mid-word", () => {
    const long = `We are hiring ${"a very ".repeat(30)}good engineer.`;
    expect(firstSentence("Engineer", `${long} You will build our payments platform.`)).toBe("You will build our payments platform.");
    const cut = firstSentence("Engineer", long);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(140);
    expect(cut.slice(0, -1).split(" ").every((w) => long.includes(w))).toBe(true);
    expect(cut).not.toMatch(/\bver…$/);
  });
});
