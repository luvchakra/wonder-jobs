"use client";

/**
 * Razorpay's own checkout window, opened over the page for a subscription (UPI AutoPay, cards, net banking). The card
 * or bank details are entered in Razorpay's frame, never in WonderWorks. If the script can't load (offline, blocked),
 * the caller falls back to Razorpay's hosted page.
 */
const SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
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

export type CheckoutOutcome = { kind: "paid"; paymentId: string; subscriptionId: string; signature: string } | { kind: "closed" } | { kind: "failed"; reason?: string } | { kind: "unavailable" };

/** Opens Razorpay's window; resolves when the candidate pays, closes it, or it can't open. */
export async function openRazorpayCheckout(input: { keyId: string; subscriptionId: string; planLabel: string; email?: string | null }): Promise<CheckoutOutcome> {
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
        subscription_id: input.subscriptionId,
        name: "WonderWorks",
        description: `${input.planLabel} · monthly`,
        prefill: input.email ? { email: input.email } : undefined,
        theme: { color: "#6D3FE0" },
        handler: (r: RazorpayResponse) => finish({ kind: "paid", paymentId: r.razorpay_payment_id, subscriptionId: r.razorpay_subscription_id, signature: r.razorpay_signature }),
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
