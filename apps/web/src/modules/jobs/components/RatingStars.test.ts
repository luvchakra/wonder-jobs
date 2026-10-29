import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingStars } from "./RatingStars";

describe("rating stars", () => {
  it("fills the stars to the decimal and says the rating out of 5 and where it's from", () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { value: 3.5, title: "Explorium employee reviews, Oct 2026" }));
    expect(html).toContain("width:70%");
    expect(html).toContain('aria-label="Rated 3.5 out of 5. Explorium employee reviews, Oct 2026"');
    expect(html).toContain(">3.5<");
    expect(renderToStaticMarkup(createElement(RatingStars, { value: 4.5, inline: true }))).toContain("width:90%");
  });

  it("has a short form for cards: one star and the number", () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { value: 4.3, compact: true, title: "Explorium" }));
    expect(html.match(/★/g)).toHaveLength(1);
    expect(html).toContain(">4.3<");
    expect(html).toContain('aria-label="Rated 4.3 out of 5. Explorium"');
  });
});
