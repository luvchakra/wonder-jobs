/**
 * "High paying jobs", "well-paid IAM roles", "top salary in Pune": words about pay, not a job title.
 * They ask for the best-paid jobs first, so they're read as that preference and taken out of the role
 * words — searching the boards for "high" found nothing a candidate meant. Literal: only these phrases
 * count, and nothing about an amount is inferred from them.
 */
const PAY = /\b(?:(?:highest|higher|high|top|best|better|well|good|great)[\s-]+(?:paying|paid|pay|salary|salaried|compensation|income|package|ctc)|lucrative)\b/gi;

export function readPay(text: string): { high: boolean; from: string; rest: string } {
  const found = text.match(PAY) ?? [];
  if (!found.length) return { high: false, from: "", rest: text };
  return { high: true, from: found.join(", "), rest: text.replace(PAY, " ").replace(/\s{2,}/g, " ").trim() };
}
