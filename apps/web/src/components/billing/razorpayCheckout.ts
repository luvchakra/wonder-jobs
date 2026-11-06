"use client";

/**
 * Razorpay's own checkout window, opened over the page for a subscription (UPI AutoPay, cards, net banking). The card
 * or bank details are entered in Razorpay's frame, never in WonderWorks. If the script can't load (offline, blocked),
 * the caller falls back to Razorpay's hosted page.
 */
const SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
  razorpay_signature: string;
}
interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

let loading: Promise<RazorpayCtor | null> | null = null;

function loadScript(): Promise<RazorpayCtor | null> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loading ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve(w.Razorpay ?? null);
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(null);
    };
    document.head.appendChild(s);
    window.setTimeout(() => resolve(w.Razorpay ?? null), 10_000);
  });
  return loading;
}

/** What the server checks: the signature over the order (`orderId`) or the subscription (`subscriptionId`). */
export type Paid = { paymentId: string; signature: string } & ({ subscriptionId: string } | { orderId: string });
export type CheckoutOutcome = { kind: "paid"; paid: Paid } | { kind: "closed" } | { kind: "failed"; reason?: string } | { kind: "unavailable" };

/**
 * Opens Razorpay's window for a subscription or (Standard Checkout) an order the server created; resolves when the
 * candidate pays, closes it, or it can't open. The amount comes from the server's order, never from this page.
 */
export async function openRazorpayCheckout(input: { keyId: string; planLabel: string; email?: string | null } & ({ subscriptionId: string } | { orderId: string; amount: number; currency: string })): Promise<CheckoutOutcome> {
  const Razorpay = await loadScript();
  if (!Razorpay) return { kind: "unavailable" };
  return new Promise((resolve) => {
    let done = false;
    const finish = (o: CheckoutOutcome) => {
      if (done) return;
      done = true;
      resolve(o);
    };
    try {
      // A failed attempt stays in Razorpay's window so the candidate can try another method; it's reported only if they then close it.
      let lastFailure: string | undefined;
      const rzp = new Razorpay({
        key: input.keyId,
        ...("orderId" in input ? { order_id: input.orderId, amount: input.amount, currency: input.currency } : { subscription_id: input.subscriptionId }),
        name: "WonderWorks",
        description: "orderId" in input ? `${input.planLabel} · one month` : `${input.planLabel} · monthly`,
        prefill: input.email ? { email: input.email } : undefined,
        theme: { color: "#6D3FE0" },
        handler: (r: RazorpayResponse) =>
          finish({
            kind: "paid",
            paid: "orderId" in input ? { orderId: r.razorpay_order_id ?? input.orderId, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } : { subscriptionId: r.razorpay_subscription_id ?? input.subscriptionId, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature },
          }),
        modal: { ondismiss: () => finish(lastFailure ? { kind: "failed", reason: lastFailure } : { kind: "closed" }), confirm_close: true },
      });
      rzp.on("payment.failed", (r) => {
        lastFailure = r.error?.description || "The payment didn't go through";
      });
      rzp.open();
    } catch {
      finish({ kind: "unavailable" });
    }
  });
}
