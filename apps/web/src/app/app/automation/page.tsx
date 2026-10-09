import { redirect } from "next/navigation";

/** Automation lives on its settings page; links to /app/automation land there. */
export default function AutomationPage() {
  redirect("/app/automation/settings");
}
