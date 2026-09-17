import type { JobSource } from "@/domain/jobs/types";

/** Job sources with a source adapter (mock adapters for now — see services/jobs/sources.ts). */
export const JOB_SOURCES: JobSource[] = [
  { id: "linkedin", name: "LinkedIn", short: "in", integrated: true, enabled: true, reliability: "high", color: "#0a66c2" },
  { id: "indeed", name: "Indeed", short: "id", integrated: true, enabled: true, reliability: "high", color: "#2557a7" },
  { id: "naukri", name: "Naukri", short: "nk", integrated: true, enabled: true, reliability: "medium", color: "#4a90e2" },
  { id: "foundit", name: "Foundit", short: "fd", integrated: true, enabled: true, reliability: "medium", color: "#6d4cf5" },
  { id: "glassdoor", name: "Glassdoor", short: "gd", integrated: true, enabled: true, reliability: "medium", color: "#0caa41" },
  { id: "wellfound", name: "Wellfound", short: "wf", integrated: true, enabled: true, reliability: "medium", color: "#111111" },
];

export interface CompanySeed {
  name: string;
  domain: string;
  industry: string;
  color: string;
  hq: string;
  size: "startup" | "scaleup" | "enterprise";
}

export const COMPANIES: CompanySeed[] = [
  { name: "Google", domain: "google.com", industry: "Technology", color: "#4285f4", hq: "Bengaluru, India", size: "enterprise" },
  { name: "Microsoft", domain: "microsoft.com", industry: "Technology", color: "#00a4ef", hq: "Hyderabad, India", size: "enterprise" },
  { name: "Amazon", domain: "amazon.com", industry: "E-commerce", color: "#ff9900", hq: "Bengaluru, India", size: "enterprise" },
  { name: "Meta", domain: "meta.com", industry: "Technology", color: "#0866ff", hq: "Remote", size: "enterprise" },
  { name: "Airbnb", domain: "airbnb.com", industry: "Travel", color: "#ff5a5f", hq: "Remote", size: "enterprise" },
  { name: "Flipkart", domain: "flipkart.com", industry: "E-commerce", color: "#2874f0", hq: "Bengaluru, India", size: "enterprise" },
  { name: "Swiggy", domain: "swiggy.com", industry: "Consumer", color: "#fc8019", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Zomato", domain: "zomato.com", industry: "Consumer", color: "#e23744", hq: "Gurugram, India", size: "scaleup" },
  { name: "Razorpay", domain: "razorpay.com", industry: "Fintech", color: "#2b6ff5", hq: "Bengaluru, India", size: "scaleup" },
  { name: "PhonePe", domain: "phonepe.com", industry: "Fintech", color: "#5f259f", hq: "Bengaluru, India", size: "scaleup" },
  { name: "CRED", domain: "cred.club", industry: "Fintech", color: "#151515", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Atlassian", domain: "atlassian.com", industry: "Technology", color: "#0052cc", hq: "Bengaluru, India", size: "enterprise" },
  { name: "Uber", domain: "uber.com", industry: "Mobility", color: "#000000", hq: "Hyderabad, India", size: "enterprise" },
  { name: "Stripe", domain: "stripe.com", industry: "Fintech", color: "#635bff", hq: "Remote", size: "enterprise" },
  { name: "Notion", domain: "notion.so", industry: "Technology", color: "#000000", hq: "Remote", size: "scaleup" },
  { name: "Freshworks", domain: "freshworks.com", industry: "Technology", color: "#e64c3c", hq: "Chennai, India", size: "enterprise" },
  { name: "Zoho", domain: "zoho.com", industry: "Technology", color: "#e42527", hq: "Chennai, India", size: "enterprise" },
  { name: "Postman", domain: "postman.com", industry: "Technology", color: "#ff6c37", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Meesho", domain: "meesho.com", industry: "E-commerce", color: "#9f2089", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Groww", domain: "groww.in", industry: "Fintech", color: "#00d09c", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Zerodha", domain: "zerodha.com", industry: "Fintech", color: "#387ed1", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Ola", domain: "olacabs.com", industry: "Mobility", color: "#000000", hq: "Bengaluru, India", size: "scaleup" },
  { name: "Nykaa", domain: "nykaa.com", industry: "E-commerce", color: "#fc2779", hq: "Mumbai, India", size: "scaleup" },
  { name: "Adobe", domain: "adobe.com", industry: "Technology", color: "#ff0000", hq: "Noida, India", size: "enterprise" },
  { name: "Salesforce", domain: "salesforce.com", industry: "Technology", color: "#00a1e0", hq: "Hyderabad, India", size: "enterprise" },
  { name: "Shopify", domain: "shopify.com", industry: "E-commerce", color: "#96bf48", hq: "Remote", size: "enterprise" },
  { name: "Canva", domain: "canva.com", industry: "Technology", color: "#00c4cc", hq: "Remote", size: "enterprise" },
  { name: "Grab", domain: "grab.com", industry: "Mobility", color: "#00b14f", hq: "Singapore", size: "enterprise" },
  { name: "Careem", domain: "careem.com", industry: "Mobility", color: "#44b284", hq: "Dubai, UAE", size: "enterprise" },
  { name: "Revolut", domain: "revolut.com", industry: "Fintech", color: "#0075eb", hq: "London, UK", size: "enterprise" },
  { name: "Tata Digital", domain: "tatadigital.com", industry: "E-commerce", color: "#486aae", hq: "Mumbai, India", size: "enterprise" },
  { name: "Jio Platforms", domain: "jio.com", industry: "Telecom", color: "#0f3cc9", hq: "Mumbai, India", size: "enterprise" },
  { name: "Paytm", domain: "paytm.com", industry: "Fintech", color: "#00baf2", hq: "Noida, India", size: "enterprise" },
  { name: "Dream11", domain: "dream11.com", industry: "Gaming", color: "#e10000", hq: "Mumbai, India", size: "scaleup" },
  { name: "upGrad", domain: "upgrad.com", industry: "Education", color: "#e04b2c", hq: "Mumbai, India", size: "scaleup" },
  { name: "BYJU'S", domain: "byjus.com", industry: "Education", color: "#7d3c98", hq: "Bengaluru, India", size: "enterprise" },
  { name: "Chargebee", domain: "chargebee.com", industry: "Technology", color: "#ff7846", hq: "Chennai, India", size: "scaleup" },
  { name: "BrowserStack", domain: "browserstack.com", industry: "Technology", color: "#f97316", hq: "Mumbai, India", size: "scaleup" },
  { name: "Slice", domain: "sliceit.com", industry: "Fintech", color: "#7c3aed", hq: "Bengaluru, India", size: "startup" },
  { name: "Setu", domain: "setu.co", industry: "Fintech", color: "#0f766e", hq: "Bengaluru, India", size: "startup" },
];

export const TITLES: { title: string; seniority: "junior" | "mid" | "senior" | "lead" | "director"; track: "product" | "growth" | "program" | "analytics" | "design" | "engineering"; weight: number }[] = [
  { title: "Product Manager", seniority: "mid", track: "product", weight: 8 },
  { title: "Senior Product Manager", seniority: "senior", track: "product", weight: 8 },
  { title: "Product Manager, Growth", seniority: "mid", track: "growth", weight: 4 },
  { title: "Senior Product Manager, Platform", seniority: "senior", track: "product", weight: 3 },
  { title: "Group Product Manager", seniority: "lead", track: "product", weight: 3 },
  { title: "Lead Product Manager", seniority: "lead", track: "product", weight: 3 },
  { title: "Director of Product", seniority: "director", track: "product", weight: 2 },
  { title: "Associate Product Manager", seniority: "junior", track: "product", weight: 4 },
  { title: "Product Manager, Payments", seniority: "mid", track: "product", weight: 3 },
  { title: "Product Manager, AI", seniority: "senior", track: "product", weight: 3 },
  { title: "Technical Product Manager", seniority: "senior", track: "product", weight: 3 },
  { title: "Growth Manager", seniority: "mid", track: "growth", weight: 2 },
  { title: "Program Manager", seniority: "mid", track: "program", weight: 3 },
  { title: "Senior Program Manager", seniority: "senior", track: "program", weight: 2 },
  { title: "Product Analyst", seniority: "junior", track: "analytics", weight: 3 },
  { title: "Product Operations Manager", seniority: "mid", track: "program", weight: 2 },
  { title: "Product Designer", seniority: "mid", track: "design", weight: 2 },
  { title: "Engineering Manager", seniority: "lead", track: "engineering", weight: 2 },
  { title: "Product Marketing Manager", seniority: "mid", track: "growth", weight: 2 },
];

export const LOCATIONS = [
  { city: "Bengaluru, India", country: "IN", weight: 8 },
  { city: "Hyderabad, India", country: "IN", weight: 4 },
  { city: "Mumbai, India", country: "IN", weight: 4 },
  { city: "Pune, India", country: "IN", weight: 3 },
  { city: "Delhi NCR, India", country: "IN", weight: 3 },
  { city: "Chennai, India", country: "IN", weight: 2 },
  { city: "Remote, India", country: "IN", weight: 4 },
  { city: "Singapore", country: "SG", weight: 1 },
  { city: "Dubai, UAE", country: "AE", weight: 1 },
  { city: "London, UK", country: "GB", weight: 1 },
];

export const SKILLS = {
  product: ["Product Strategy", "Roadmapping", "User Research", "A/B Testing", "SQL", "Analytics", "Stakeholder Management", "Go-to-Market", "Prioritization", "Agile", "PRDs", "Experimentation", "Metrics", "Pricing"],
  growth: ["Growth Loops", "Funnel Optimization", "A/B Testing", "Analytics", "SQL", "Retention", "Lifecycle Marketing", "Experimentation", "Metrics"],
  program: ["Program Management", "Cross-functional Leadership", "Risk Management", "Agile", "Stakeholder Management", "Roadmapping"],
  analytics: ["SQL", "Python", "Analytics", "Dashboards", "Experimentation", "Metrics"],
  design: ["Figma", "Design Systems", "User Research", "Prototyping", "Interaction Design"],
  engineering: ["System Design", "People Management", "Agile", "Hiring", "Architecture"],
} as const;

export const TAGS_BY_TRACK: Record<string, string[]> = {
  product: ["Leadership", "Growth", "Strategy", "AI", "Platform", "Consumer", "B2B"],
  growth: ["Growth", "Analytics", "Consumer", "Experimentation"],
  program: ["Operations", "Delivery", "Cross-functional"],
  analytics: ["Analytics", "Data", "Experimentation"],
  design: ["Design", "UX"],
  engineering: ["Engineering", "Leadership"],
};
