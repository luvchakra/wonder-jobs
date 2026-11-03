import { describe, expect, it } from "vitest";
import { aboutText, detailRows } from "./storyImage";

describe("the share image's details", () => {
  it("splits labelled rows, keeps unlabelled ones as text, and leaves out links (they can't be tapped in an image)", () => {
    expect(detailRows(["Subject: Maths", "A demo class is part of hiring", "Call for papers: https://x.test/cfp", "Pay: ₹40,000: monthly"])).toEqual([
      ["Subject", "Maths"],
      [null, "A demo class is part of hiring"],
      ["Pay", "₹40,000: monthly"],
    ]);
    expect(detailRows(Array.from({ length: 9 }, (_, i) => `K${i}: v`))).toHaveLength(6);
  });

  it("the description is plain text, cut at a word", () => {
    expect(aboutText("<p>Hello&nbsp;<b>world</b> &amp; more</p>", 100)).toBe("Hello world & more");
    expect(aboutText("one two three four five six", 14)).toBe("one two three…");
    expect(aboutText(undefined, 10)).toBe("");
  });

  it("where a listing came from stays off the image (it names our sources, not the listing)", () => {
    expect(detailRows(["From: WorksLake Data Gateway · Teaching", "Source: confs.tech", "Subject: Maths"])).toEqual([["Subject", "Maths"]]);
  });
});
