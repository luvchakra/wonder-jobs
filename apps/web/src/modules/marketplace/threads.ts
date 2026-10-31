import type { Offer, ThreadStatus, mayDo } from "./domain";

/** One conversation as the screens read it: what each side sees, never the other's contact details unless they shared. */
export interface ThreadView {
  id: string;
  listingId: string;
  title: string;
  price: number;
  /** The item as its listing card shows it. */
  item: { photo?: string; photos: string[]; description: string; condition: string; area: string; category: string; negotiable: boolean };
  side: "buyer" | "seller";
  counterpart: string;
  status: ThreadStatus;
  offers: Offer[];
  may: ReturnType<typeof mayDo>;
  contacts: { email: string }[];
  youSharedContact: boolean;
  youMarkedDone?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: string;
  mine: boolean;
  body: string;
  /** Shown with a warning: the message asks for money up front or sounds like a known scam. */
  risky: boolean;
  at: string;
}
