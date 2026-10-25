import { describe, expect, it } from "vitest";
import { parseWonderIntent } from "./intent";

// Ask Wonder's "Try asking" chips (app/app/ask/page.tsx) must each resolve to one of Wonder's actions, not a plain search.
const EXAMPLES = ["What should I focus on today?", "How are my applications going?", "Which applications need attention?", "What skills am I missing?", "Prepare my strongest match", "Search again as Director"];

describe("Ask Wonder's examples", () => {
  it.each(EXAMPLES)("“%s” is an action", (x) => {
    expect(parseWonderIntent(x).type).not.toBe("search_jobs");
  });
});
