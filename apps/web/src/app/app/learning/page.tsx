import { redirect } from "next/navigation";

/** Learning became Skill Up (owner, 2026-10-20); old links and bookmarks land there. */
export default function LearningPage() {
  redirect("/app/skill-up");
}
