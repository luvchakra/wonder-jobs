const $ = (id) => document.getElementById(id);

function show(connected, profile, origin) {
  $("connected").hidden = !connected;
  $("disconnected").hidden = connected;
  $("disconnect").hidden = !connected;
  if (connected) {
    $("status").textContent = `Connected to ${new URL(origin).host}`;
    $("name").textContent = profile?.fullName || "Not set in Career DNA";
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
    window.close();
  };
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
    window.close();
  } catch {
    // Chrome's own pages, the Web Store and PDFs don't let any extension in.
    $("status").textContent = "Chrome doesn't let the helper work on this page.";
    $("fill").disabled = false;
    $("fill").textContent = "Fill the form on this tab";
  }
});

$("retry").addEventListener("click", refresh);
$("disconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "disconnect" });
  refresh();
});

refresh();
