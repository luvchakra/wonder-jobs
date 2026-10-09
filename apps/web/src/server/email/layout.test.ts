import { describe, expect, it } from "vitest";
import { emailLogoUrl, escapeHtml, renderEmailLayout } from "./layout";
import { renderContactEmail } from "@/server/notify";

const base = { origin: "https://jobs.wonderapps.biz", preheader: "3 strong matches", bodyHtml: "<p>Body</p>", bodyText: "Body", reason: "You're getting this because you asked for it." };

describe("renderEmailLayout — the one branded frame for every email", () => {
  it("puts the PNG logo, built from the site URL, in the header", () => {
    const { html } = renderEmailLayout(base);
    expect(emailLogoUrl("https://jobs.wonderapps.biz")).toBe("https://jobs.wonderapps.biz/brand/wonderjobs-logo-light.png");
    expect(html).toContain('<img src="https://jobs.wonderapps.biz/brand/wonderjobs-logo-light.png"');
    expect(html).toContain('alt="WonderJobs"');
    expect(renderEmailLayout({ ...base, origin: "http://localhost:3000" }).html).toContain('src="http://localhost:3000/brand/wonderjobs-logo-light.png"');
  });

  it("is table-based with inline styles only, max 600px, and a hidden preheader", () => {
    const { html } = renderEmailLayout(base);
    expect(html).not.toMatch(/<style|<link|<script|<svg|data:image/i);
    expect(html).toContain('role="presentation"');
    expect(html).toContain("max-width:600px");
    expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all[^"]*">3 strong matches/);
    expect(html).toContain("<p>Body</p>");
  });

  it("footer: WonderJobs, the caller's reason, settings and privacy links, plus the email's own links", () => {
    const { html, text } = renderEmailLayout({ ...base, links: [{ label: "Stop these emails", href: "/api/digest/unsubscribe?u=a&s=b" }] });
    expect(html).toContain("You&#39;re getting this because you asked for it.");
    expect(html).toContain('href="https://jobs.wonderapps.biz/app/profile#notifications"');
    expect(html).toContain('href="https://jobs.wonderapps.biz/privacy"');
    expect(html).toContain('href="https://jobs.wonderapps.biz/api/digest/unsubscribe?u=a&amp;s=b"');
    expect(text).toBe(
      [
        "Body",
        "",
        "—",
        "WonderJobs",
        "You're getting this because you asked for it.",
        "Notification settings: https://jobs.wonderapps.biz/app/profile#notifications",
        "Privacy: https://jobs.wonderapps.biz/privacy",
        "Stop these emails: https://jobs.wonderapps.biz/api/digest/unsubscribe?u=a&s=b",
      ].join("\n"),
    );
  });

  it("leaves out the settings link for an email those settings don't control", () => {
    const { html, text } = renderEmailLayout({ ...base, settingsLink: false });
    expect(html).not.toContain("/app/profile#notifications");
    expect(text).not.toContain("Notification settings");
    expect(html).toContain("/privacy");
  });

  it("escapes the values it inserts", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;");
    const { html } = renderEmailLayout({ ...base, preheader: "<img src=x onerror=alert(1)>", reason: "<b>why</b>", links: [{ label: "<i>x</i>", href: '/x?a="1"' }] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>why</b>");
    expect(html).toContain("&lt;b&gt;why&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});

describe("the contact notification goes through the layout", () => {
  const payload = { name: "Sample <Visitor>", email: "visitor@example.com", topic: "support", message: "Line one & <script>alert(1)</script>\nLine two", page: "/pricing" };

  it("produces branded HTML and a plain-text twin with the same content", () => {
    const mail = renderContactEmail(payload, "https://jobs.wonderapps.biz");
    expect(mail.subject).toBe("[WonderJobs contact] support — Sample <Visitor>");
    expect(mail.html).toContain('src="https://jobs.wonderapps.biz/brand/wonderjobs-logo-light.png"');
    expect(mail.html).toContain("set to receive WonderJobs contact-form messages");
    expect(mail.html).not.toContain("/app/profile#notifications");
    expect(mail.html).toContain("Sample &lt;Visitor&gt;");
    expect(mail.html).toContain("Line one &amp; &lt;script&gt;alert(1)&lt;/script&gt;<br>Line two");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("Sample <Visitor> <visitor@example.com> wrote via /pricing (topic: support):\n\nLine one & <script>alert(1)</script>\nLine two\n\nReply to this email to answer visitor@example.com.");
    expect(mail.text).toContain("Privacy: https://jobs.wonderapps.biz/privacy");
  });
});
