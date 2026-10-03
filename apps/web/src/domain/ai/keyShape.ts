import type { AIProviderId } from "./types";

export type OwnProvider = Exclude<AIProviderId, "wonderjobs">;

/**
 * Which provider a pasted key belongs to, from its shape alone — so nobody has to know what
 * "Anthropic" or "Gemini" means before pasting. Null when it looks like none of them.
 */
export function detectProvider(key: string): OwnProvider | null {
  const k = key.trim();
  if (/^sk-ant-/.test(k)) return "anthropic";
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(k)) return "gemini";
  if (/^sk-[A-Za-z0-9_-]{16,}$/.test(k)) return "openai";
  return null;
}

/** Where to get a key, in plain steps, with the one page to open. */
export const KEY_GUIDE: Record<OwnProvider, { product: string; url: string; steps: string[]; billing: string }> = {
  openai: {
    product: "ChatGPT (OpenAI)",
    url: "https://platform.openai.com/api-keys",
    steps: ["Sign in with the account you use for ChatGPT.", "Press “Create new secret key”, give it any name, and copy it.", "Paste it here."],
    billing: "OpenAI bills your account for what you use; a ChatGPT Plus subscription doesn't cover this, so add a small amount of credit under Billing first.",
  },
  anthropic: {
    product: "Claude (Anthropic)",
    url: "https://console.anthropic.com/settings/keys",
    steps: ["Sign in or create a free console account.", "Press “Create Key”, give it any name, and copy it.", "Paste it here."],
    billing: "Anthropic bills your account for what you use; a Claude Pro subscription doesn't cover this, so add a small amount of credit under Billing first.",
  },
  gemini: {
    product: "Gemini (Google)",
    url: "https://aistudio.google.com/apikey",
    steps: ["Sign in with your Google account.", "Press “Create API key” and copy it.", "Paste it here."],
    billing: "Google's free tier covers light use; beyond it Google bills your account for what you use.",
  },
};
