import { describe, expect, it } from "vitest";
import { rawFromWeWorkRemotely, rawFromWorkingNomads } from "./providers";
import { normalizePosting } from "@/services/jobs/normalize";

// Shapes as the live feeds answered on 2026-11-01 (WJ-544).
const WWR = `<?xml version="1.0"?><rss><channel><title>We Work Remotely</title>
<item>
  <title>Doximity: Senior Software Engineer, Data</title>
  <region>Anywhere in the World</region>
  <category>Full-Stack Programming</category>
  <type>Full-Time</type>
  <skills>python, sql</skills>
  <description>&lt;p&gt;Build &amp;amp; ship data pipelines.&lt;/p&gt;</description>
  <pubDate>Sun, 01 Nov 2026 07:31:04 +0000</pubDate>
  <guid>https://weworkremotely.com/remote-jobs/doximity-senior-software-engineer-data</guid>
  <link>https://weworkremotely.com/remote-jobs/doximity-senior-software-engineer-data</link>
</item>
<item><title>No company separator here</title><link>https://weworkremotely.com/remote-jobs/x</link></item>
</channel></rss>`;

describe("We Work Remotely feed", () => {
  it("splits “Company: Role”, keeps the region, type, date and the job's own page", () => {
    const [p, ...rest] = rawFromWeWorkRemotely(WWR);
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({ externalId: "wwr:doximity-senior-software-engineer-data", title: "Senior Software Engineer, Data", company: "Doximity", location: "Remote (Anywhere in the World)", remote: true, postedAt: "2026-11-01T07:31:04.000Z", applyUrl: "https://weworkremotely.com/remote-jobs/doximity-senior-software-engineer-data", jobType: "Full-Time" });
    expect(p.tags).toEqual(["Full-Stack Programming", "Full-Time", "python", "sql"]);
    expect(p.description).toContain("Build & ship data pipelines.");
    expect(normalizePosting("weworkremotely", p).title).toBe("Senior Software Engineer, Data");
  });
});

describe("Working Nomads feed", () => {
  it("keeps the company, its tags, date and the job's own page as its id", () => {
    const p = rawFromWorkingNomads({ url: "https://www.workingnomads.com/job/go/1981017/", title: "Senior Magento Developer", description: "<p>Magento</p>", company_name: "Lemon.io", category_name: "Development", tags: "php,magento, javascript", location: "Europe, LATAM", pub_date: "2026-10-29T09:50:51-04:00" });
    expect(p).toMatchObject({ externalId: "wn:1981017", company: "Lemon.io", location: "Remote (Europe, LATAM)", remote: true, postedAt: "2026-10-29T09:50:51-04:00", applyUrl: "https://www.workingnomads.com/job/go/1981017/" });
    expect(p.tags).toEqual(["Development", "php", "magento", "javascript"]);
  });
});
