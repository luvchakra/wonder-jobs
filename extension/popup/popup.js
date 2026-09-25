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

$("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "fillNow" });
    window.close();
  } catch {
    // No content script on this tab: it isn't a supported application page.
    $("status").textContent = "This page isn't an application form the extension knows.";
  }
});

$("retry").addEventListener("click", refresh);
$("disconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "disconnect" });
  refresh();
});

refresh();
