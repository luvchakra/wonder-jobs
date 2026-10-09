import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXTENSION_RELEASE } from "./extensionRelease";

const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../../../extension/manifest.json"), "utf8")) as { version: string; description: string };

describe("the helper release the /extension page offers", () => {
  it("is the version in the manifest, and lists what changed in it", () => {
    expect(EXTENSION_RELEASE.version).toBe(manifest.version);
    expect(EXTENSION_RELEASE.changes[0].version).toBe(manifest.version);
  });
  it("has a store-sized description that doesn't claim it never submits", () => {
    expect(manifest.description.length).toBeLessThanOrEqual(132);
    expect(manifest.description).not.toMatch(/never submits/i);
  });
});
