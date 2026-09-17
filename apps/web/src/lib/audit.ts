/** Fire-and-forget audit event for an external action. Never blocks the UI. */
export function auditAction(input: { actionId: string; actionType: "submit_application" | "send_recruiter_message" | "send_email"; event: string; detail?: string }) {
  if (typeof fetch === "undefined") return;
  try {
    void fetch("/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}
