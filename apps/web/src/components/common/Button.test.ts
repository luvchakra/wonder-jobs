import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

const html = (props: Parameters<typeof Button>[0]) => renderToStaticMarkup(createElement(Button, props, "Go"));

describe("Button with an external link", () => {
  it("is a real anchor to another site that opens in a new tab, never a button that calls window.open", () => {
    const out = html({ href: "https://clinic.example/", external: true });
    expect(out).toMatch(/^<a /);
    expect(out).toContain('href="https://clinic.example/"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain("<button");
  });

  it("a tel: or mailto: link is an anchor that stays in the page", () => {
    const out = html({ href: "tel:+912012345678", external: true });
    expect(out).toContain('href="tel:+912012345678"');
    expect(out).not.toContain("target=");
  });

  it("an internal href is still a client-side route, and no href is still a button", () => {
    expect(html({ href: "/app/m/therapists" })).toContain('href="/app/m/therapists"');
    expect(html({ onClick: () => undefined })).toMatch(/^<button/);
  });
});
