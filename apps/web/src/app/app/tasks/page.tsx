import { redirect } from "next/navigation";

/** Needs attention is Notifications' second tab now (owner, 2026-10-29); old links land there. */
export default function TasksPage() {
  redirect("/app/notifications?tab=attention");
}
