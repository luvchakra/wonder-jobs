/**
 * Which state or province a city is in — a fixed gazetteer, not a guess. Used only when the candidate's
 * location names a city but not its state ("Mumbai, India" → Maharashtra), and labelled "Derived by Wonder".
 */
const STATE_OF: Record<string, { state: string; country: string }> = {};

const add = (country: string, state: string, cities: string[]) => {
  for (const c of cities) STATE_OF[c.toLowerCase()] = { state, country };
};

add("India", "Maharashtra", ["Mumbai", "Bombay", "Navi Mumbai", "Thane", "Pune", "Nagpur", "Nashik", "Aurangabad"]);
add("India", "Karnataka", ["Bengaluru", "Bangalore", "Mysuru", "Mysore", "Mangaluru", "Mangalore"]);
add("India", "Telangana", ["Hyderabad", "Secunderabad", "Warangal"]);
add("India", "Tamil Nadu", ["Chennai", "Madras", "Coimbatore", "Madurai"]);
add("India", "Delhi", ["New Delhi", "Delhi"]);
add("India", "Haryana", ["Gurugram", "Gurgaon", "Faridabad"]);
add("India", "Uttar Pradesh", ["Noida", "Greater Noida", "Lucknow", "Kanpur", "Ghaziabad", "Varanasi"]);
add("India", "West Bengal", ["Kolkata", "Calcutta"]);
add("India", "Gujarat", ["Ahmedabad", "Gandhinagar", "Surat", "Vadodara"]);
add("India", "Kerala", ["Kochi", "Cochin", "Thiruvananthapuram", "Trivandrum"]);
add("India", "Rajasthan", ["Jaipur", "Jodhpur", "Udaipur"]);
add("India", "Madhya Pradesh", ["Indore", "Bhopal"]);
add("India", "Chandigarh", ["Chandigarh"]);
add("India", "Odisha", ["Bhubaneswar"]);
add("India", "Goa", ["Panaji", "Goa"]);
add("United States", "California", ["San Francisco", "Los Angeles", "San Jose", "San Diego", "Palo Alto", "Mountain View", "Sunnyvale", "Oakland"]);
add("United States", "New York", ["New York", "New York City", "Brooklyn"]);
add("United States", "Washington", ["Seattle", "Redmond", "Bellevue"]);
add("United States", "Texas", ["Austin", "Dallas", "Houston", "San Antonio"]);
add("United States", "Massachusetts", ["Boston", "Cambridge"]);
add("United States", "Illinois", ["Chicago"]);
add("United States", "Georgia", ["Atlanta"]);
add("United States", "Colorado", ["Denver", "Boulder"]);
add("Canada", "Ontario", ["Toronto", "Ottawa", "Waterloo"]);
add("Canada", "British Columbia", ["Vancouver"]);
add("Canada", "Quebec", ["Montreal", "Montréal"]);
add("Australia", "New South Wales", ["Sydney"]);
add("Australia", "Victoria", ["Melbourne"]);

/** The state for a city, when the city is known and (if given) the country agrees. */
export function stateForCity(city: string, country?: string): string | undefined {
  const hit = STATE_OF[city.trim().toLowerCase()];
  if (!hit) return undefined;
  if (country && !sameCountry(country, hit.country)) return undefined;
  return hit.state;
}

const COUNTRY_ALIASES: string[][] = [
  ["india", "in", "ind", "bharat"],
  ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a.", "america"],
  ["united kingdom", "uk", "u.k.", "great britain", "britain", "england", "gb"],
  ["united arab emirates", "uae", "u.a.e."],
  ["canada", "ca"],
  ["australia", "au"],
  ["singapore", "sg"],
  ["germany", "de", "deutschland"],
  ["netherlands", "the netherlands", "holland", "nl"],
];

/** Every name a country goes by, the country's own name first. */
export function countryAliases(country: string): string[] {
  const c = country.trim().toLowerCase();
  return COUNTRY_ALIASES.find((names) => names.includes(c)) ?? [c];
}

export const sameCountry = (a: string, b: string) => countryAliases(a).includes(b.trim().toLowerCase());
