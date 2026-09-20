/**
 * Fills an employer's application form from WonderJobs.
 *
 * Two layers, in order: the known field names each ATS actually ships
 * (Greenhouse, Lever, Ashby), then a generic pass that reads each field's
 * visible label. Anything neither layer recognises is left alone and reported,
 * rather than guessed at — this is somebody's real job application.
 *
 * Nothing is ever submitted. The candidate reviews and clicks Apply themselves.
 */

const CONCEPTS = ["firstName", "lastName", "fullName", "email", "resume", "coverLetter"];

const SITE_RULES = {
  greenhouse: {
    firstName: ["#first_name", "input[name='first_name']", "input[autocomplete='given-name']"],
    lastName: ["#last_name", "input[name='last_name']", "input[autocomplete='family-name']"],
    email: ["#email", "input[name='email']", "input[type='email']"],
    resume: ["#resume", "input[type='file'][name*='resume' i]", "input[type='file']"],
    coverLetter: ["#cover_letter_text", "textarea[name*='cover' i]", "#cover_letter"],
  },
  lever: {
    fullName: ["input[name='name']"],
    email: ["input[name='email']", "input[type='email']"],
    resume: ["input[name='resume']", "input[type='file']"],
    coverLetter: ["textarea[name='comments']", "textarea[name*='cover' i]"],
  },
  ashby: {
    fullName: ["input[id*='_systemfield_name' i]", "input[name='_systemfield_name']"],
    email: ["input[id*='_systemfield_email' i]", "input[type='email']"],
    resume: ["input[id*='_systemfield_resume' i]", "input[type='file']"],
    coverLetter: ["textarea[id*='cover' i]", "textarea[name*='cover' i]"],
  },
};

const GENERIC_RULES = {
  firstName: { match: /\bfirst[\s_-]*name\b|\bgiven[\s_-]*name\b|\bfname\b/i },
  lastName: { match: /\blast[\s_-]*name\b|\bsurname\b|\bfamily[\s_-]*name\b|\blname\b/i },
  fullName: { match: /\b(full[\s_-]*name|your[\s_-]*name|name)\b/i, reject: /company|employer|user|file|referr|school|university|college|manager|recruiter|pronoun/i },
  email: { match: /e-?mail/i },
  resume: { match: /resume|cv\b|curriculum/i, file: true },
  coverLetter: { match: /cover[\s_-]*letter|motivation|why (do you|are you)/i },
};

function site() {
  const host = location.hostname.toLowerCase();
  if (host.endsWith("greenhouse.io")) return "greenhouse";
  if (host.endsWith("lever.co")) return "lever";
  if (host.endsWith("ashbyhq.com")) return "ashby";
  return null;
}

function visible(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.type === "hidden") return false;
  const rect = el.getBoundingClientRect();
  // A file input is often visually hidden behind a styled button — still fillable, still counts.
  if (el.type === "file") return true;
  return rect.width > 0 && rect.height > 0;
}

/** Every bit of text a human would read as this field's label. */
function labelText(el) {
  const bits = [el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("name"), el.id];
  if (el.id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) bits.push(forLabel.textContent);
  }
  const wrapping = el.closest("label");
  if (wrapping) bits.push(wrapping.textContent);
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) bits.push(document.getElementById(id)?.textContent);
  }
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function bySiteRules(concept) {
  const rules = SITE_RULES[site()]?.[concept] ?? [];
  for (const selector of rules) {
    const el = document.querySelector(selector);
    if (el && visible(el)) return el;
  }
  return null;
}

function byLabel(concept) {
  const rule = GENERIC_RULES[concept];
  if (!rule) return null;
  const fields = [...document.querySelectorAll("input, textarea")].filter(visible);
  for (const el of fields) {
    if (rule.file && el.type !== "file") continue;
    if (!rule.file && (el.type === "file" || el.type === "checkbox" || el.type === "radio" || el.type === "submit" || el.type === "button")) continue;
    const text = labelText(el);
    if (!text || !rule.match.test(text)) continue;
    if (rule.reject && rule.reject.test(text)) continue;
    return el;
  }
  return null;
}

function resolve(concept) {
  return bySiteRules(concept) ?? byLabel(concept);
}

/** React (which Greenhouse and Ashby both use) ignores a plain `.value =`; the native setter plus an input event is what it listens for. */
function setValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function base64ToFile(base64, filename, type) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type });
}

/** A FileList can't be built directly, but a DataTransfer's can — the standard way to attach a file to an `<input type=file>` from script. */
function attachFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function fillPage() {
  const [profileReply, applicationReply] = await Promise.all([
    chrome.runtime.sendMessage({ type: "profile" }),
    chrome.runtime.sendMessage({ type: "application", payload: { url: location.href } }),
  ]);
  if (profileReply?.error === "not_connected") return { error: "not_connected" };
  const profile = profileReply?.data;
  if (!profile) return { error: "request_failed" };
  const application = applicationReply?.data?.matched ? applicationReply.data : null;

  const filled = [];
  const skipped = [];

  const first = resolve("firstName");
  const last = resolve("lastName");
  if (first && last && profile.firstName) {
    setValue(first, profile.firstName);
    setValue(last, profile.lastName);
    filled.push("Name");
  } else {
    const full = resolve("fullName");
    if (full && profile.fullName) {
      setValue(full, profile.fullName);
      filled.push("Name");
    } else if (profile.fullName) {
      skipped.push("Name (no matching field found)");
    }
  }

  const email = resolve("email");
  if (email && profile.email) {
    setValue(email, profile.email);
    filled.push("Email");
  } else if (profile.email) {
    skipped.push("Email (no matching field found)");
  }

  const resumeInput = resolve("resume");
  if (resumeInput && application?.resume) {
    attachFile(resumeInput, base64ToFile(application.resume.base64, application.resume.filename, DOCX_MIME));
    filled.push(`Resume (${application.resume.filename})`);
  } else if (resumeInput && !application) {
    skipped.push("Resume — WonderJobs has no prepared resume for this posting");
  }

  const coverInput = resolve("coverLetter");
  if (coverInput && application?.coverLetter) {
    if (coverInput.type === "file" && application.coverLetter.file) {
      attachFile(coverInput, base64ToFile(application.coverLetter.file.base64, application.coverLetter.file.filename, DOCX_MIME));
      filled.push(`Cover letter (${application.coverLetter.file.filename})`);
    } else if (coverInput.type !== "file") {
      setValue(coverInput, application.coverLetter.text);
      filled.push("Cover letter");
    }
  } else if (coverInput && !application) {
    skipped.push("Cover letter — WonderJobs has no prepared cover letter for this posting");
  }

  return { filled, skipped, missing: profile.missing ?? [], application };
}

/* --------------------------------------------------------------- in-page UI */

const PANEL_ID = "wonderjobs-autofill-root";

function panel() {
  let host = document.getElementById(PANEL_ID);
  if (host) return host.shadowRoot;
  host = document.createElement("div");
  host.id = PANEL_ID;
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .pill { display:inline-flex; align-items:center; gap:8px; border:0; border-radius:999px; padding:10px 16px; background:#6d4cf5; color:#fff; font-size:13px; font-weight:600; cursor:pointer; box-shadow:0 6px 20px rgba(17,24,39,.25); }
      .pill:hover { background:#5b3ae0; }
      .pill[disabled] { opacity:.7; cursor:default; }
      .card { width:320px; max-width:calc(100vw - 32px); background:#fff; color:#111827; border-radius:16px; box-shadow:0 12px 40px rgba(17,24,39,.28); padding:14px; font-size:13px; line-height:1.5; }
      .card h2 { margin:0 0 2px; font-size:14px; }
      .muted { color:#6b7280; font-size:12px; }
      ul { margin:8px 0 0; padding-left:18px; }
      li { margin:2px 0; }
      .ok li { color:#15803d; }
      .todo li { color:#b45309; }
      .row { display:flex; gap:8px; align-items:center; justify-content:space-between; margin-top:10px; }
      .link { color:#6d4cf5; text-decoration:none; font-weight:600; }
      .close { border:0; background:transparent; color:#6b7280; cursor:pointer; font-size:16px; line-height:1; }
    </style>
    <div id="slot"></div>`;
  document.documentElement.appendChild(host);
  return shadow;
}

function renderButton() {
  const shadow = panel();
  const slot = shadow.getElementById("slot");
  slot.innerHTML = `<button class="pill" id="fill">Fill with WonderJobs</button>`;
  shadow.getElementById("fill").addEventListener("click", run);
}

function renderResult(result) {
  const shadow = panel();
  const slot = shadow.getElementById("slot");
  if (result.error === "not_connected") {
    slot.innerHTML = `
      <div class="card">
        <div class="row" style="margin:0"><h2>Not connected</h2><button class="close" id="x">&times;</button></div>
        <p class="muted">Open WonderJobs and sign in — the extension picks it up from there automatically.</p>
        <div class="row"><a class="link" href="https://jobs.wonderapps.biz/app" target="_blank" rel="noreferrer">Open WonderJobs</a><button class="pill" id="retry">Try again</button></div>
      </div>`;
    shadow.getElementById("retry").addEventListener("click", run);
    shadow.getElementById("x").addEventListener("click", renderButton);
    return;
  }
  if (result.error) {
    slot.innerHTML = `
      <div class="card">
        <div class="row" style="margin:0"><h2>Couldn't fill this page</h2><button class="close" id="x">&times;</button></div>
        <p class="muted">WonderJobs didn't answer. Check you're signed in, then try again.</p>
        <div class="row"><span></span><button class="pill" id="retry">Try again</button></div>
      </div>`;
    shadow.getElementById("retry").addEventListener("click", run);
    shadow.getElementById("x").addEventListener("click", renderButton);
    return;
  }
  const { filled, skipped, missing, application } = result;
  const matchLine = application ? `Using your prepared materials for <strong>${escapeHtml(application.jobTitle || "this role")}</strong>.` : "WonderJobs has no application for this posting, so only your profile was filled.";
  slot.innerHTML = `
    <div class="card">
      <div class="row" style="margin:0"><h2>${filled.length ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"}` : "Nothing to fill"}</h2><button class="close" id="x">&times;</button></div>
      <p class="muted">${matchLine}</p>
      ${filled.length ? `<ul class="ok">${filled.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
      ${skipped.length ? `<ul class="todo">${skipped.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
      ${missing.length ? `<p class="muted" style="margin-top:10px">Fill these yourself — WonderJobs doesn't hold them: ${missing.map(escapeHtml).join(", ")}.</p>` : ""}
      <div class="row"><span class="muted">Nothing is submitted for you.</span><button class="pill" id="again">Fill again</button></div>
    </div>`;
  shadow.getElementById("again").addEventListener("click", run);
  shadow.getElementById("x").addEventListener("click", renderButton);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function run() {
  const shadow = panel();
  const button = shadow.getElementById("fill");
  if (button) {
    button.disabled = true;
    button.textContent = "Filling…";
  }
  try {
    renderResult(await fillPage());
  } catch (error) {
    renderResult({ error: String(error?.message ?? error) });
  }
}

/** Only offer on a page that actually has something to fill in. */
function hasApplicationForm() {
  return CONCEPTS.some((concept) => resolve(concept) !== null);
}

function start() {
  if (window.top !== window.self && !hasApplicationForm()) return; // a tracking iframe, not the form
  if (hasApplicationForm()) renderButton();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();

// Greenhouse and Ashby render the form after the first paint; look again for a few seconds.
let attempts = 0;
const poll = setInterval(() => {
  attempts += 1;
  if (document.getElementById(PANEL_ID) || attempts > 10) return clearInterval(poll);
  if (hasApplicationForm()) {
    renderButton();
    clearInterval(poll);
  }
}, 700);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "fillNow") return false;
  run().then(() => sendResponse({ ok: true }));
  return true;
});
