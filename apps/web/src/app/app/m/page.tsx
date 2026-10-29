import { redirect } from "next/navigation";

/**
 * No separate WonderWorks search page (owner, 2026-10-29): every module searches from its own Find, which has Jobs'
 * structure. /app/m opens Find for the module in use, as /app does.
 */
export default function ModulesPage() {
  redirect("/app");
}
