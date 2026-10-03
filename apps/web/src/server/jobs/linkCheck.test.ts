import { describe, expect, it } from "vitest";
import { classifyLink, visibleText } from "./linkCheck";

const page = (body: string) => `<html><head><script>var msg = "This job is no longer available";</script><style>.x{}</style></head><body>${body}</body></html>`;

describe("is the original posting still open?", () => {
  it("a 404 or 410 is closed; other errors and bot challenges are unknown, never closed", () => {
    expect(classifyLink({ status: 404, text: "" }).status).toBe("closed");
    expect(classifyLink({ status: 410, text: "" }).status).toBe("closed");
    expect(classifyLink({ status: 403, text: "" }).status).toBe("unknown");
    expect(classifyLink({ status: 503, text: "" }).status).toBe("unknown");
    expect(classifyLink({ status: 200, text: page("<h1>Just a moment...</h1><p>Performing security verification</p>") }).status).toBe("unknown");
  });

  it("a page that says the posting has closed is closed, and says why", () => {
    expect(classifyLink({ status: 200, text: page("<h2>This job post is closed</h2>") })).toEqual({ status: "closed", reason: "the posting's page says “This job post is closed”" });
    expect(classifyLink({ status: 200, text: page("<p>Sorry, this position has been filled.</p>") }).status).toBe("closed");
    expect(classifyLink({ status: 200, text: page("<p>We are no longer accepting applications for this role.</p>") }).status).toBe("closed");
    expect(classifyLink({ status: 200, text: page("<p>The job you are looking for is no longer available.</p>") }).status).toBe("closed");
  });

  it("an open posting stays open — words in scripts don't count, and an ordinary description isn't misread", () => {
    expect(classifyLink({ status: 200, text: page("<h1>Senior Product Manager</h1><p>Apply now. You'll own the roadmap; the role is open to remote candidates.</p>") }).status).toBe("open");
    expect(visibleText(page("<p>Hello</p>"))).toBe("Hello");
  });
});
