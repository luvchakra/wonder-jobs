import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/MarketingPage";

export const metadata: Metadata = { title: "Cookies", description: "The cookies WonderJobs sets and what each one is for." };

export default function CookiesPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Cookies"
      intro="WonderJobs uses a handful of first-party cookies to keep you signed in. There are no advertising or cross-site tracking cookies."
      updated="September 2026"
      sections={[
        {
          id: "list",
          title: "Cookies we set",
          body: (
            <ul>
              <li>
                <strong>wj-auth</strong> (and numbered chunks): your sign-in session. HTTP-only, expires when you sign out or after long inactivity.
              </li>
              <li>
                <strong>wj_user</strong>: which account this browser last used, so the app can load the right data before the server responds.
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
