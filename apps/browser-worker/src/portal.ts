/**
 * Signing in to an employer's application portal, or creating the account, in a background fill (owner decision
 * 2026-10-17, WJ-316). WonderJobs sends the candidate's own saved sign-in — or one it made for them, with their
 * consent — for this one sign-in; it is typed into the portal's own email and password fields, the account form's
 * consent box is ticked when creating, and the form's one Sign In / Create Account button is pressed. Nothing else
 * on the page is touched, hidden fields (honeypots) never are, and the password is never logged or kept here.
 * worker.test.ts holds this file to exactly that.
 */
import type { Frame, Locator, Page } from "playwright";

export type SignInMode = "sign_in" | "create";
export type SignInResult = { result: "signed_in" | "needs_verification" | "failed" | "no_form"; message?: string };

const SUBMIT = { sign_in: /^\s*(sign in|log in|login|sign on|continue)\s*$/i, create: /^\s*(create account|create my account|register|sign up|create)\s*$/i };

/** The first of these that is on the page and visible. */
async function first(frame: Frame | Page, selectors: string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = frame.locator(sel).filter({ visible: true });
    if (await loc.count()) return loc.first();
  }
  return null;
}

async function passwordFields(page: Page): Promise<Locator[]> {
  const all = page.locator("input[type=password]").filter({ visible: true });
  const n = await all.count();
  return Array.from({ length: Math.min(n, 2) }, (_, i) => all.nth(i));
}

/** The one button that sends this form, by its Workday id or its own words. */
async function submitButton(page: Page, mode: SignInMode): Promise<Locator | null> {
  const wd = await first(page, [mode === "create" ? "[data-automation-id=createAccountSubmitButton]" : "[data-automation-id=signInSubmitButton]"]);
  if (wd) return wd;
  const buttons = page.locator("button, input[type=submit], [role=button]").filter({ visible: true });
  const n = await buttons.count();
  const hits: Locator[] = [];
  for (let i = 0; i < Math.min(n, 60); i++) {
    const b = buttons.nth(i);
    const text = ((await b.textContent().catch(() => "")) || (await b.getAttribute("value").catch(() => "")) || "").trim();
    if (SUBMIT[mode].test(text)) hits.push(b);
  }
  return hits.length === 1 ? hits[0] : null;
}

/** The page the sign-in landed on: still the form with an error, a "verify your email" page, or past it. */
async function outcome(page: Page): Promise<SignInResult> {
  await page.waitForTimeout(5000);
  const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 6000);
  if (/verify (your )?(email|account)|verification (email|link)|check your (email|inbox)|confirm your email/i.test(text)) return { result: "needs_verification", message: "The portal sent a verification email." };
  const stillForm = (await page.locator("input[type=password]").filter({ visible: true }).count()) > 0;
  if (stillForm) {
    const err = await first(page, ["[data-automation-id=errorMessage]", "[role=alert]", "[aria-live=assertive]"]);
    const message = err ? (await err.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 160) : "";
    return { result: "failed", message: message || "The portal didn't accept the sign-in." };
  }
  return { result: "signed_in" };
}

export async function portalSignIn(page: Page, mode: SignInMode, email: string, password: string): Promise<SignInResult> {
  // Workday shows Create Account first; an existing account signs in from its own "Sign In" link on that form.
  if (mode === "sign_in" && (await first(page, ["[data-automation-id=createAccountSubmitButton]"]))) {
    const link = await first(page, ["[data-automation-id=signInLink]"]);
    if (link) {
      await link.click({ force: true });
      await page.waitForTimeout(1500);
    }
  }
  const emailBox = await first(page, ["[data-automation-id=email]", "input[type=email]", "input[autocomplete=username]", "input[autocomplete=email]", "input[name*=email i]", "input[id*=email i]"]);
  const pw = await passwordFields(page);
  if (!emailBox || !pw.length || (mode === "create" && pw.length < 2)) return { result: "no_form", message: "No sign-in form on this page." };
  const button = await submitButton(page, mode);
  if (!button) return { result: "no_form", message: "Couldn't tell which button sends this form." };

  await emailBox.fill(email);
  await pw[0].fill(password);
  if (mode === "create") {
    await pw[1].fill(password);
    // The account form's own consent box ("I agree…"): the candidate agreed when they chose Create an account.
    const consent = await first(page, ["[data-automation-id=createAccountCheckbox]"]);
    if (consent && !(await consent.isChecked().catch(() => true))) await consent.check({ force: true });
  }
  // Workday lays a transparent "click_filter" over its buttons; the press lands on the button's own spot.
  await button.click({ force: true });
  return outcome(page);
}
