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
