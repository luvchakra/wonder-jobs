import { describe, expect, it } from "vitest";
import { htmlToText, looksLikeHtml } from "./normalize";

describe("htmlToText", () => {
  it("cleans HTML a source sent entity-escaped, even twice (Arbeitnow)", () => {
    const once = '&lt;div class="content-intro"&gt;&lt;p&gt;&lt;strong&gt;Mavericks Wanted&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;When was the last time?&lt;/p&gt;&lt;/div&gt;';
    expect(htmlToText(once)).toBe("Mavericks Wanted\nWhen was the last time?");
    const twice = '&amp;lt;p&amp;gt;&amp;lt;span data-ccp-props=&amp;quot;{&amp;amp;quot;1&amp;amp;quot;:true}&amp;quot;&amp;gt;In 2015&amp;lt;/span&amp;gt;&amp;lt;/p&amp;gt;';
    expect(htmlToText(twice)).toBe("In 2015");
  });

  it("leaves plain text alone and recognises a stored description that is still markup", () => {
    expect(htmlToText("Build secure systems. 5+ years.")).toBe("Build secure systems. 5+ years.");
    expect(looksLikeHtml('<div class="content-intro"><p>Mavericks</p></div>')).toBe(true);
    expect(looksLikeHtml("Salary < 30 LPA and > 20 LPA")).toBe(false);
  });
});
