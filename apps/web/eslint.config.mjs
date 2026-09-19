import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Playwright fixtures use a `use()` parameter that is unrelated to the React hook of the same
    // name — react-hooks' name-based heuristic can't tell the difference, so it's scoped off here
    // rather than disabled inline at every fixture (there will be more as the suite grows).
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vercel output-dir workaround copies .next here during builds (see scripts/fix-output-dir.mjs)
    "apps/**",
  ]),
]);

export default eslintConfig;
