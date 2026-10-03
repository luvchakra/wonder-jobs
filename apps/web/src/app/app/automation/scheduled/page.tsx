import { redirect } from "next/navigation";

/** Scheduled searches are a section of Automation now. */
export default function ScheduledRunsPage() {
  redirect("/app/automation/settings#scheduled");
}
