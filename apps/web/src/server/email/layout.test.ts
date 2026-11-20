import { describe, expect, it } from "vitest";
import { emailLogoUrl, escapeHtml, renderEmailLayout } from "./layout";
import { renderContactEmail } from "@/server/notify";

const base = { origin: "https://works.wonderapps.biz", preheader: "3 strong matches", bodyHtml: "<p>Body</p>", bodyText: "Body", reason: "You're getting this because you asked for it." };

describe("renderEmailLayout — the one branded frame for every email", () => {
  it("puts the mark (a PNG built from the site URL) and the name as live text in the header, so dark mode can't hide it", () => {
    const { html } = renderEmailLayout(base);
    expect(emailLogoUrl("https://works.wonderapps.biz")).toBe("https://works.wonderapps.biz/brand/wonderstar-mark-square.png");
    expect(html).toContain('<img src="https://works.wonderapps.biz/brand/wonderstar-mark-square.png"');
    expect(html).toMatch(/>Wonder<span style="color:#6d4cf5">Works<\/span>/);
    expect(renderEmailLayout({ ...base, origin: "http://localhost:3000" }).html).toContain('src="http://localhost:3000/brand/wonderstar-mark-square.png"');
  });

  it("is table-based with inline styles only, max 560px, and a hidden preheader", () => {
    const { html } = renderEmailLayout(base);
    expect(html).not.toMatch(/<style|<link|<script|<svg|data:image/i);
    expect(html).toContain('role="presentation"');
    expect(html).toContain("max-width:560px");
    expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all[^"]*">3 strong matches/);
    expect(html).toContain("<p>Body</p>");
  });

  it("footer: WonderWorks, the caller's reason, settings and privacy links, plus the email's own links", () => {
    const { html, text } = renderEmailLayout({ ...base, links: [{ label: "Stop these emails", href: "/api/digest/unsubscribe?u=a&s=b" }] });
    expect(html).toContain("You&#39;re getting this because you asked for it.");
    expect(html).toContain('href="https://works.wonderapps.biz/app/settings/notifications"');
    expect(html).toContain('href="https://works.wonderapps.biz/privacy"');
    expect(html).toContain('href="https://works.wonderapps.biz/api/digest/unsubscribe?u=a&amp;s=b"');
    expect(text).toBe(
      [
        "Body",
        "",
        "—",
        "WonderWorks",
        "You're getting this because you asked for it.",
        "Notification settings: https://works.wonderapps.biz/app/settings/notifications",
        "Privacy: https://works.wonderapps.biz/privacy",
        "Stop these emails: https://works.wonderapps.biz/api/digest/unsubscribe?u=a&s=b",
      ].join("\n"),
    );
  });

  it("leaves out the settings link for an email those settings don't control", () => {
    const { html, text } = renderEmailLayout({ ...base, settingsLink: false });
    expect(html).not.toContain("/app/settings/notifications");
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
    const mail = renderContactEmail(payload, "https://works.wonderapps.biz");
    expect(mail.subject).toBe("[WonderWorks contact] support — Sample <Visitor>");
    expect(mail.html).toContain('src="https://works.wonderapps.biz/brand/wonderstar-mark-square.png"');
    expect(mail.html).toContain("set to receive WonderWorks contact-form messages");
    expect(mail.html).not.toContain("/app/settings/notifications");
    expect(mail.html).toContain("Sample &lt;Visitor&gt;");
    expect(mail.html).toContain("Line one &amp; &lt;script&gt;alert(1)&lt;/script&gt;<br>Line two");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("Sample <Visitor> <visitor@example.com> wrote via /pricing (topic: support):\n\nLine one & <script>alert(1)</script>\nLine two\n\nReply to this email to answer visitor@example.com.");
    expect(mail.text).toContain("Privacy: https://works.wonderapps.biz/privacy");
  });
});
