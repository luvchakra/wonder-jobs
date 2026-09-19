/**
 * The four test candidates from the test plan's own fixtures. Used wherever a spec needs a plausible,
 * consistent profile rather than a throwaway string — matching changes are easier to reason about when
 * every spec builds on the same handful of personas.
 */
export const CANDIDATE_A = {
  label: "Senior IAM professional",
  headline: "Senior IAM Leader",
  yearsExperience: 17,
  seniority: "director" as const,
  skills: ["IAM", "Saviynt", "SailPoint", "OIM", "CyberArk", "Okta", "Azure", "AWS", "Java", "Python"],
  industries: ["Banking", "Insurance", "Technology"],
  locations: ["Mumbai", "Pune", "Remote"],
  careerGoal: "Senior leadership roles in identity and access management",
};

export const CANDIDATE_B = {
  label: "Career switcher",
  headline: "Aspiring Product Manager",
  yearsExperience: 4,
  seniority: "mid" as const,
  skills: ["SQL", "Figma", "User Research"],
  industries: ["Consumer", "Gaming"],
  locations: ["Bengaluru", "Remote"],
  careerGoal: "Move from operations into consumer product management",
};

export const CANDIDATE_C = {
  label: "Minimal profile",
  headline: "",
  yearsExperience: 0,
  seniority: "junior" as const,
  skills: ["Excel"],
  industries: [] as string[],
  locations: ["Remote"],
  careerGoal: "",
};

export const CANDIDATE_D = {
  label: "Privacy/security candidate",
  headline: "Security-Conscious Candidate",
  yearsExperience: 10,
  seniority: "senior" as const,
  skills: ["Security", "Compliance"],
  industries: ["Technology"],
  locations: ["Remote"],
  careerGoal: "Used for tenant isolation, BYOK and deletion tests",
};
