import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Cookies", description: "The cookies WonderJobs sets and what each one is for." };

export default function CookiesPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Cookies"
      intro="WonderJobs uses a handful of first-party cookies to keep you signed in. They are all strictly necessary, so there is no consent banner: there are no analytics, advertising or cross-site tracking cookies."
      updated="October 2026"
      sections={[
        {
          id: "list",
          title: "Cookies we set",
          body: (
            <ul>
              <li>
                <strong>wj-auth</strong> (and numbered chunks): your sign-in session tokens. Readable by the app&apos;s own scripts (the sign-in library needs that), sent only over HTTPS, never to other sites (SameSite=Lax). Cleared when you sign out; otherwise it expires after 400 days. A Content Security Policy limits where the page can load scripts from and send data to.
              </li>
              <li>
                <strong>wj_user</strong>: which account this browser last used, so the app can load the right data before the server responds.
              </li>
              <li>
                <strong>wj-auth-code-verifier</strong>: a one-time value used while you sign in with Google, removed when sign-in completes.
              </li>
              <li>
                <strong>wj_uid</strong>: only on deployments running without sign-in (local development) — an HTTP-only random id that keeps that browser&apos;s data together.
              </li>
              <li>
                <strong>wj_demo</strong>: set when you enter the demo so the product runs on sample data. Cleared when you exit the demo.
              </li>
            </ul>
          ),
        },
        { id: "storage", title: "Browser storage", body: <p>The app also caches your own data in your browser&apos;s local storage so pages open instantly. It is namespaced per account and cleared on sign-out.</p> },
        { id: "control", title: "Your choices", body: <p>Blocking these cookies means you can&apos;t stay signed in, but the public pages and the demo still work. You can clear them any time from your browser settings.</p> },
      ]}
    />
  );
}
