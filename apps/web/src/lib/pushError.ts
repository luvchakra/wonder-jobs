/**
 * What to tell the candidate when the browser refuses to subscribe to push. Browsers word these for
 * developers ("Registration failed - push service error"); the candidate needs the thing to change.
 */
export function pushErrorMessage(e: unknown, isBrave = false): string {
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e ?? "");
  if (name === "NotAllowedError") return "This browser is blocking notifications for WonderJobs. Allow them in the site settings, then try again.";
  // Chrome's AbortError: its push service (Google's) wouldn't register this browser.
  if (name === "AbortError" || /push service/i.test(message)) {
    return isBrave
      ? "Brave keeps push off by default. Turn on “Use Google services for push messaging” in brave://settings/privacy, then try again."
      : "This browser's push service didn't accept the request. Try again in a minute; if it keeps failing, your network or a privacy setting is blocking push — Chrome, Edge and Firefox work by default.";
  }
  return message || "Try again in a minute.";
}
