const $ = (id) => document.getElementById(id);
/** The same page runs as the side panel (Chrome with sidePanel) and as the old popup (?popup=1). */
const IS_POPUP = location.search.includes("popup=1");
document.body.classList.toggle("popup", IS_POPUP);
/** Closes the popup after an action; the side panel stays open. */
const done = () => {
  if (IS_POPUP) window.close();
};
let appOrigin = "https://jobs.wonderapps.biz";
let connectedNow = false;

function show(connected, profile, origin) {
  $("connected").hidden = !connected;
  $("disconnected").hidden = connected;
  $("disconnect").hidden = !connected;
  if (connected) {
    $("status").textContent = `Connected to ${new URL(origin).host}`;
    $("name").textContent = profile?.fullName || "Not set in Career Profile";
    $("email").textContent = profile?.email || "Not available";
  } else {
    $("status").textContent = "Not connected";
  }
}

async function refresh() {
  $("status").textContent = "Checking…";
  const reply = await chrome.runtime.sendMessage({ type: "status" });
  show(!!reply?.connected, reply?.profile, reply?.origin ?? "https://jobs.wonderapps.biz");
  // An Apply with Wonder destination the helper hasn't been allowed on yet (an employer's own careers site).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const site = tab?.url ? await chrome.runtime.sendMessage({ type: "tabStatus", payload: { url: tab.url } }) : null;
  $("site").hidden = !(site?.session && !site.granted);
  if (site?.session && !site.granted) $("site-host").textContent = new URL(site.origin).host;
  $("allow").onclick = async () => {
    // Asked only for this one site, and only because the candidate clicked (§46–§47).
    const ok = await chrome.permissions.request({ origins: [`${site.origin}/*`] });
    if (ok && tab?.id) await chrome.runtime.sendMessage({ type: "injectTab", payload: { tabId: tab.id } });
    done();
  };
  connectedNow = !!reply?.connected;
  if (reply?.origin) appOrigin = reply.origin;
  showJob();
}

/**
 * Fills the form on this tab. A page no application knows (a job board's redirect to another site) is
 * offered to the candidate's latest Apply with Wonder application, which asks before reading anything;
 * with none, the profile fill runs. Outside the helper's built-in list the form script isn't on the tab
 * yet: opening this popup gave the helper access to this one tab (activeTab), so it is put there now.
 */
async function fillTab(tab) {
  const adopted = tab.url ? await chrome.runtime.sendMessage({ type: "adoptTab", payload: { tabId: tab.id, url: tab.url } }).catch(() => null) : null;
  const message = adopted?.sessionId ? { type: "jobsApplyAdopt", sessionId: adopted.sessionId } : { type: "fillNow" };
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Not on this tab yet. Every frame the helper may reach first (a form inside an iframe), else the page itself.
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["content/autofill.js"] })
      .catch(() => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/autofill.js"] }));
    // A freshly started script finds the adopted application itself (the tab is bound to it).
    return adopted?.sessionId ? undefined : chrome.tabs.sendMessage(tab.id, message);
  }
}

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  $("fill").disabled = true;
  $("fill").textContent = "Filling…";
  try {
    await fillTab(tab);
    done();
    $("fill").disabled = false;
    $("fill").textContent = "Fill the form on this tab";
  } catch {
    // Chrome's own pages, the Web Store and PDFs don't let any extension in.
    $("status").textContent = "Chrome doesn't let the helper work on this page.";
    $("fill").disabled = false;
    $("fill").textContent = "Fill the form on this tab";
  }
});

/* ------------------------------------------------------------- the job on this tab */

const JOB_SITES = ["https://www.linkedin.com/*", "https://www.naukri.com/*"];
let reading = 0;

const setText = (id, text) => {
  $(id).textContent = text ?? "";
  $(id).hidden = !text;
};

/**
 * Reads the job on the active tab, once. The helper may read a tab only after the candidate clicked its
 * icon there (activeTab), or on LinkedIn/Naukri once they allowed it — otherwise this resolves undefined.
 */
async function readTab(tab) {
  if (!tab?.id) return undefined;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/read-job.js"] });
    return r?.result ?? null;
  } catch {
    return undefined;
  }
}

function hint(text, offerJobSites) {
  $("job").hidden = true;
  $("job-hint").hidden = !text;
  $("job-hint-text").textContent = text ?? "";
  $("job-sites").hidden = !offerJobSites;
  $("fill").className = "primary";
}

function render(v) {
  $("job-hint").hidden = true;
  $("job").hidden = false;
  setText("job-from", `Read from ${v.readFrom}`);
  setText("job-title", v.title);
  // The company's logo from JobsLake when it has one; nothing is shown otherwise.
  const logo = $("job-logo");
  logo.hidden = !v.logo;
  if (v.logo && v.logo.startsWith("data:image/")) logo.src = v.logo;
  else logo.removeAttribute("src");
  setText("job-sub", [v.company, v.location].filter(Boolean).join(" · "));
  const fit = $("job-fit");
  fit.replaceChildren();
  if (v.match) {
    const score = document.createElement("span");
    score.className = "score";
    score.textContent = String(v.match.score);
    fit.append(score, document.createTextNode(v.match.fitLabel));
  } else {
    const link = document.createElement("a");
    link.href = `${appOrigin}/app/career-dna`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Add your role and skills to your profile";
    fit.append(link, document.createTextNode(" to see how well this job fits you."));
  }
  const reasons = $("job-reasons");
  reasons.replaceChildren(...(v.match?.reasons ?? []).map((r) => Object.assign(document.createElement("li"), { textContent: r.summary })));
  reasons.hidden = !reasons.children.length;
  setText("job-gap", v.match?.gap ? `Gap: ${v.match.gap.summary}` : "");
  const app = v.application;
  setText("job-status", app ? `${app.statusLabel} · ${new Date(app.since).toLocaleDateString()}` : "");
  $("job-save").hidden = !!app;
  $("job-apply").hidden = !app || !["saved", "preparing", "ready_for_review"].includes(app.status);
  $("job-apply").href = `${appOrigin}/app/jobs/${encodeURIComponent(v.jobId)}/apply`;
  $("job-open").hidden = !app;
  $("job-open").href = `${appOrigin}/app/jobs/${encodeURIComponent(v.jobId)}`;
  // One primary action: while the card offers one, filling a form is the quiet option.
  $("fill").className = "ghost";
}

async function showJob() {
  const ticket = ++reading;
  if (!connectedNow) return hint(null);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // WonderJobs' own pages already show their jobs.
  if (tab?.url && tab.url.startsWith(appOrigin)) return hint(null);
  const page = await readTab(tab);
  if (ticket !== reading) return;
  if (page === undefined) {
    const allowed = await chrome.permissions.contains({ origins: JOB_SITES }).catch(() => false);
    return hint("Click the WonderJobs icon on a job page to see how well it fits you.", !allowed && !IS_POPUP);
  }
  if (!page) return hint(null);
  const r = await chrome.runtime.sendMessage({ type: "jobRead", payload: { page } }).catch(() => null);
  if (ticket !== reading) return;
  if (!r?.data) return hint(r?.status === 400 ? null : "Couldn't read this job right now.");
  $("job").dataset.page = JSON.stringify(page);
  render(r.data);
}

$("job-save").addEventListener("click", async () => {
  const page = JSON.parse($("job").dataset.page ?? "null");
  if (!page) return;
  $("job-save").disabled = true;
  $("job-save").textContent = "Saving…";
  const r = await chrome.runtime.sendMessage({ type: "jobSave", payload: { page } }).catch(() => null);
  $("job-save").disabled = false;
  $("job-save").textContent = "Save";
  if (r?.data) render(r.data);
  else setText("job-gap", "Couldn't save it right now. Try again.");
});

$("job-sites").addEventListener("click", async () => {
  // Asked only because the candidate clicked, and only for these two job sites.
  if (await chrome.permissions.request({ origins: JOB_SITES }).catch(() => false)) showJob();
});

let pending = null;
const soon = () => {
  clearTimeout(pending);
  pending = setTimeout(showJob, 400);
};
if (!IS_POPUP) {
  chrome.tabs.onActivated.addListener(soon);
  // LinkedIn changes jobs without loading a new page: a new address is enough.
  chrome.tabs.onUpdated.addListener((_id, info, tab) => {
    if (tab.active && (info.status === "complete" || info.url)) soon();
  });
  // A click on the icon (recorded by the worker) is what lets the panel read that tab.
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes["wj.clicked"]) soon();
  });
}

$("retry").addEventListener("click", refresh);
$("disconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "disconnect" });
  refresh();
});

refresh();
