import { describe, expect, it } from "vitest";
import { calendarSubscribeLinks } from "./calendarLinks";

describe("calendar subscribe links", () => {
  it("hand the feed to each calendar app's own subscribe screen", () => {
    const l = calendarSubscribeLinks("https://jobs.wonderapps.biz/api/calendar/t1.abc.ics");
    expect(l.apple).toBe("webcal://jobs.wonderapps.biz/api/calendar/t1.abc.ics");
    expect(l.google).toBe("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fjobs.wonderapps.biz%2Fapi%2Fcalendar%2Ft1.abc.ics");
    expect(l.outlook).toBe("https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fjobs.wonderapps.biz%2Fapi%2Fcalendar%2Ft1.abc.ics&name=WonderJobs");
    expect(l.office365).toContain("https://outlook.office.com/calendar/0/addfromweb?url=https%3A%2F%2F");
  });
});
