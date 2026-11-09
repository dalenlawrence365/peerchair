const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const FOOTER_ADDRESS = "2549 Young Avenue #B, Thousand Oaks, CA 91360"
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

/* Cold-test invite (happy hour). Dalen's approved copy, 2026-11-09.
   Deliberately plain: no logos, no images, no buttons — a short personal-looking
   email lands better on a brand-new sending subdomain than a branded HTML card.

   Approved edits to Dalen's draft: "reserve" -> "request"; opening carries
   "as CFO of {company}" (dropped automatically when the company or a CFO title is unknown).
   The long P.S. is kept exactly as written. */

export function coldSubject(o) {
  return o.weekday + ", " + o.time_range + ": CFO happy hour in " + o.location
}

export function renderColdInviteHtml(o) {
  // o: first_name, company, is_cfo, when_short, time_range, location, host_name, rsvp_url, unsub_url
  const who = (o.company && o.is_cfo) ? "as CFO of " + esc(o.company) + ", " : ""
  const p = function (t, last) { return '<p style="margin:0 0 ' + (last ? "0" : "16") + 'px;">' + t + "</p>" }
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#ffffff;">' +
  '<div style="max-width:560px;margin:0 auto;padding:24px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#20242f;">' +
  p("Hi " + esc(o.first_name) + ",") +
  p("I'm bringing together a group of Los Angeles CFOs this " + esc(o.when_short) + ", from " + esc(o.time_range) + " in " + esc(o.location) + ", and " + who + "I'd like to extend an invitation to you.") +
  p("It's a casual, CFO-only happy hour hosted by CFO Circle Los Angeles, with hospitality provided by " + esc(o.host_name) + ". No presentations, no pitches, and no agenda. Just an opportunity to meet other accomplished CFOs in the area.") +
  p("We're limiting attendance to CFOs, and I personally confirm each guest.") +
  p("If you'd like to join us, request your spot here:<br><a href=\"" + o.rsvp_url + "\" style=\"color:#121a3c;\">Request your spot</a>") +
  p("I hope you can make it.") +
  p("Dalen Lawrence<br>Chapter Director | CFO Circle Los Angeles<br><a href=\"" + SITE + "\" style=\"color:#121a3c;\">LA-CFO.com</a>") +
  p("P.S. I found your business email through Apollo, a professional contact database, because you're listed as a CFO. I'm building a community of Los Angeles CFOs through gatherings like this, workshops, dinners, and occasional sporting events. My goal is to bring great CFOs together, not fill your inbox with sales pitches. I'd love to keep you informed about future invitations, but if that's not of interest, you can opt out with one click below. And if you'd ever like to connect personally, just reply. I'm always happy to meet another LA CFO.") +
  '<div style="margin-top:28px;padding-top:14px;border-top:1px solid #dfe3ee;font-size:12px;line-height:1.6;color:#5a6280;">' +
  '<a href="' + o.unsub_url + '" style="color:#5a6280;text-decoration:underline;">Opt out with one click</a><br>CFO Circle Los Angeles &middot; ' + esc(FOOTER_ADDRESS) +
  "</div></div></body></html>"
}
