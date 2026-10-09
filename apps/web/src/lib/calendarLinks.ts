/**
 * One-click "subscribe" links for a calendar feed. Each opens the calendar app's own subscribe screen
 * with the feed already filled in; the candidate confirms there. Nothing is added without that click.
 */
export function calendarSubscribeLinks(feedUrl: string, name = "WonderJobs") {
  const webcal = feedUrl.replace(/^https?:\/\//i, "webcal://");
  const enc = encodeURIComponent;
  return {
    google: `https://calendar.google.com/calendar/r?cid=${enc(webcal)}`,
    apple: webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${enc(feedUrl)}&name=${enc(name)}`,
    office365: `https://outlook.office.com/calendar/0/addfromweb?url=${enc(feedUrl)}&name=${enc(name)}`,
  };
}
