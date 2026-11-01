import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Strips every credential from the test process first, so no unit test can reach a real database or service.
    setupFiles: ["src/testing/isolate.ts"],
  },
});
