import { redirect } from "next/navigation";

export default function BillingAdminHome() {
  redirect("/platform/billing/plans");
}
