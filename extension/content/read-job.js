/**
 * Reads the job on this page, once, when the candidate opens the side panel or clicks the helper's icon
 * (docs/EXTENSION_BEYOND_AUTOFILL.md). Read-only: it touches nothing on the page, presses nothing, keeps
 * nothing, and returns plain text to the side panel, which asks WonderJobs to score it.
 *
 * Order: the page's schema.org JobPosting (most careers sites and ATSs publish one), then LinkedIn's and
 * Naukri's job view, then — only when the page plainly reads like a posting — its main text.
 * The value of the last expression is what `chrome.scripting.executeScript` hands back.
 */
(() => {
  const MAX = 50_000;
  const clean = (s) => (s ?? "").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const textOfHtml = (html) => {
    const withBreaks = String(html ?? "").replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    return clean(doc.body?.textContent ?? "");
  };
  const textOf = (el) => clean(el?.innerText ?? el?.textContent ?? "");
  const first = (...selectors) => {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && textOf(el)) return el;
    }
    return null;
  };

  function fromJsonLd() {
    const items = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent ?? "");
        const walk = (node) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) return node.forEach(walk);
          const type = node["@type"];
          if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) items.push(node);
          if (node["@graph"]) walk(node["@graph"]);
        };
        walk(data);
      } catch {
        // A malformed block on the page — skip it.
      }
    }
    const j = items[0];
    if (!j?.title) return null;
    const places = (Array.isArray(j.jobLocation) ? j.jobLocation : [j.jobLocation]).filter(Boolean);
    const location = places
      .map((p) => {
        const a = p.address ?? {};
        const country = typeof a.addressCountry === "object" ? a.addressCountry?.name : a.addressCountry;
        return [a.addressLocality, a.addressRegion, country].filter(Boolean).join(", ");
      })
      .filter(Boolean)
      .join("; ");
    const pay = j.baseSalary?.value;
    const salaryText = pay && (pay.minValue || pay.maxValue || pay.value) ? `${j.baseSalary.currency ?? ""} ${pay.minValue ?? pay.value ?? ""}${pay.maxValue ? `–${pay.maxValue}` : ""} ${pay.unitText ? `per ${String(pay.unitText).toLowerCase()}` : ""}`.trim() : undefined;
    return {
      via: "jsonld",
      title: textOfHtml(j.title),
      company: textOfHtml(typeof j.hiringOrganization === "object" ? j.hiringOrganization?.name : j.hiringOrganization),
      location,
      description: textOfHtml(j.description),
      datePosted: typeof j.datePosted === "string" ? j.datePosted : undefined,
      remote: j.jobLocationType === "TELECOMMUTE" || undefined,
      salaryText,
      employmentType: Array.isArray(j.employmentType) ? j.employmentType.join(", ") : j.employmentType,
    };
  }

  function fromLinkedIn() {
    if (!/(^|\.)linkedin\.com$/.test(location.hostname)) return null;
    const title = first(".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title", ".top-card-layout__title", "h1");
    const description = first("#job-details", ".jobs-description__content", ".jobs-box__html-content", ".description__text");
    if (!title || !description) return null;
    const company = first(".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name", ".topcard__org-name-link");
    const place = first(".job-details-jobs-unified-top-card__primary-description-container .tvm__text", ".jobs-unified-top-card__bullet", ".topcard__flavor--bullet");
    return { via: "linkedin", title: textOf(title), company: textOf(company), location: textOf(place), description: textOf(description) };
  }

  function fromNaukri() {
    if (!/(^|\.)naukri\.com$/.test(location.hostname)) return null;
    const title = first('h1[class*="jd-header-title"]', "h1");
    const description = first('[class*="job-desc"]', '[class*="dang-inner-html"]', 'section[class*="JDC"]');
    if (!title || !description) return null;
    const company = first('[class*="jd-header-comp-name"] a', '[class*="jd-header-comp-name"]');
    const places = [...document.querySelectorAll('[class*="location"] a')].map(textOf).filter(Boolean);
    return { via: "naukri", title: textOf(title), company: textOf(company), location: [...new Set(places)].join(", "), description: textOf(description) };
  }

  /** A page that plainly reads like a single posting: a heading, enough text, and a posting's usual sections. */
  function fromPage() {
    const title = document.querySelector("h1");
    const main = document.querySelector("main, article, [role=main]") ?? document.body;
    const text = textOf(main);
    if (!title || text.length < 600) return null;
    const signals = ["responsibilit", "requirement", "qualification", "what you", "about the role", "experience", "apply"].filter((w) => text.toLowerCase().includes(w));
    if (signals.length < 3) return null;
    const site = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? "";
    return { via: "page", title: textOf(title), company: clean(site), location: "", description: text };
  }

  try {
    const job = fromJsonLd() ?? fromLinkedIn() ?? fromNaukri() ?? fromPage();
    if (!job || !job.title) return null;
    return { ...job, url: location.href, title: job.title.slice(0, 300), company: (job.company ?? "").slice(0, 200), location: (job.location ?? "").slice(0, 300), description: (job.description ?? "").slice(0, MAX) };
  } catch {
    return null;
  }
})();
