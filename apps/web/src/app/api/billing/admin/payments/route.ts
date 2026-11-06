import { billingAdminRoute } from "@/server/billing/adminHttp";
import { paymentsSetup, removePaymentKeys, savePaymentKeys } from "@/server/billing/paymentsAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const origin = (req: Request) => new URL(req.url).origin;

/** GET → Razorpay's connection: keys (masked), test or live mode, the webhook to add, and which plans have a price. */
export async function GET(req: Request) {
  return billingAdminRoute(req, () => paymentsSetup(origin(req)));
}

/** PUT { keyId?, keySecret?, webhookSecret? } → checked with Razorpay, then saved encrypted. */
export async function PUT(req: Request) {
  return billingAdminRoute(req, (actor, body) => savePaymentKeys(body, actor, origin(req)));
}

/** DELETE → disconnect: removes the admin's Razorpay keys (subscriptions already paid are untouched). */
export async function DELETE(req: Request) {
  return billingAdminRoute(req, (actor) => removePaymentKeys(actor, origin(req)));
}
