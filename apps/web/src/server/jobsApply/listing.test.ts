import { describe, expect, it } from "vitest";
import { listingApplyHref, resolveListing } from "./listing";

const PAGE = "https://www.arbeitnow.ch/jobs/companies/bridgebio/director-457094";
const APPLY = `${PAGE}/apply`;
const GH = "https://job-boards.greenhouse.io/bridgebio/jobs/5265678007?utm_source=arbeitnow.ch&ref=arbeitnow.ch";
const listing = `<nav><a href="/jobs">Jobs</a><a href="/apply-tips">Apply tips and tricks</a></nav>
  <a href="${APPLY}" target="_blank" title="Apply for Director"><button class="apply_button_large" data-label-default="Apply Now"> Apply Now </button></a>
  <footer><a href="${APPLY}">Apply</a></footer>`;

describe("listingApplyHref", () => {
  it("finds the one Apply link, its text inside nested elements", () => {
    expect(listingApplyHref(listing, PAGE)).toBe(APPLY);
  });
  it("gives nothing when Apply links disagree or there are none", () => {
    expect(listingApplyHref(`${listing}<a href="https://other.example/x">Apply now</a>`, PAGE)).toBeUndefined();
    expect(listingApplyHref(`<a href="/jobs">Jobs</a>`, PAGE)).toBeUndefined();
    expect(listingApplyHref(`<a href="javascript:void(0)">Apply</a>`, PAGE)).toBeUndefined();
  });
});

describe("resolveListing", () => {
  it("follows the Apply link's address to where it lands", async () => {
    const seen: string[] = [];
    const fetch = async (url: string) => (seen.push(url), url === PAGE ? { status: 200, text: listing, finalUrl: PAGE } : { status: 200, text: "<form></form>", finalUrl: GH });
    expect(await resolveListing(PAGE, fetch)).toBe(GH);
    expect(seen).toEqual([PAGE, APPLY]);
  });
  it("gives null when the listing can't be read or the fetch fails", async () => {
    expect(await resolveListing(PAGE, async () => ({ status: 202, text: "", finalUrl: PAGE }))).toBeNull();
    expect(await resolveListing(PAGE, async () => ({ status: 200, text: "<p>no link</p>", finalUrl: PAGE }))).toBeNull();
    expect(await resolveListing(PAGE, async () => { throw new Error("blocked"); })).toBeNull();
  });
});
