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
 * Fills the form on this tab. On a site outside the helper's built-in list (an employer's own
 * careers page, Workable, a job board's redirect), the form script isn't there yet: opening this popup
 * gave the helper access to this one tab (activeTab), so it is put there now, and nowhere else.
 */
async function fillTab(tabId) {
  const fill = () => chrome.tabs.sendMessage(tabId, { type: "fillNow" });
  try {
    return await fill();
  } catch {
    // Not on this tab yet. Every frame the helper may reach first (a form inside an iframe), else the page itself.
    await chrome.scripting
      .executeScript({ target: { tabId, allFrames: true }, files: ["content/autofill.js"] })
      .catch(() => chrome.scripting.executeScript({ target: { tabId }, files: ["content/autofill.js"] }));
    return fill();
  }
}

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  $("fill").disabled = true;
  $("fill").textContent = "Filling…";
  try {
    await fillTab(tab.id);
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
