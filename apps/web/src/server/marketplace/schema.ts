import { z } from "zod";

/** A listing as the routes accept it (domain.ts::cleanListing still decides what is allowed). */
export const Listing = z.object({
  title: z.string().max(160),
  description: z.string().max(4000),
  category: z.string().max(40),
  price: z.number().int().min(1).max(100_000_000),
  negotiable: z.boolean().optional(),
  condition: z.string().max(20),
  area: z.string().max(80),
  kind: z.string().max(10).optional(),
});
