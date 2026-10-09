import { redirect } from "next/navigation";

/** The plans editor moved to Platform → Billing (admins only; everyone else gets a 404 there). */
export default function OperatorPlansPage() {
  redirect("/platform/billing/plans");
}
