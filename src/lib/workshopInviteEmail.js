const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const FOOTER_ADDRESS = "2549 Young Avenue #B, Thousand Oaks, CA 91360"
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

/* Workshop invite ("The 8 Key Drivers of CFO Success" / CFO Circle Experience Event).
   Dalen's approved copy, 2026-11-10 (from his LinkedIn post), with his edits:
   the host thank-you line is removed.

   Two P.S. variants, chosen by how we got the address:
     apollo  -> discloses Apollo as the source, with the "connect personally" close
     known   -> LinkedIn / existing contacts; no Apollo disclosure, no "connect personally" close
   The opt-out link and postal address footer are on both. */

export function workshopSubject(o) {
  return o.weekday + ", " + o.short_date + ": a CFO working session in " + o.city
}

const PS_APOLLO = "P.S. I found your business email through Apollo, a professional contact database, because you're listed as a CFO. I'm building a community of Los Angeles CFOs through gatherings like this, workshops, dinners, and occasional sporting events. My goal is to bring great CFOs together, not fill your inbox with sales pitches. I'd love to keep you informed about future invitations, but if that's not of interest, you can opt out with one click below. And if you'd ever like to connect personally, just reply. I'm always happy to meet another LA CFO."
const PS_KNOWN = "P.S. You're receiving this because you're a CFO in my Los Angeles network. I'm building a community of Los Angeles CFOs through gatherings like this, workshops, dinners, and occasional sporting events. My goal is to bring great CFOs together, not fill your inbox with sales pitches. I'd love to keep you informed about future invitations, but if that's not of interest, you can opt out with one click below."

export function renderWorkshopInviteHtml(o) {
  // o: first_name, variant ('apollo'|'known'), when_short ("Tuesday, November 17"), time_range, host_name, city, rsvp_url, unsub_url
  const p = function (t, last) { return '<p style="margin:0 0 ' + (last ? "0" : "16") + 'px;">' + t + "</p>" }
  const day = String(o.when_short || "").replace(/^[A-Za-z]+,\s*/, "")
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#ffffff;">' +
  '<div style="max-width:560px;margin:0 auto;padding:24px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#20242f;">' +
  p("Hi " + esc(o.first_name) + ",") +
  p("What happens when you put a small group of accomplished CFOs in a room and give them something worth talking about?") +
  p("That's what we're building with the CFO Circle Experience Event.") +
  p("On " + esc(o.when_short) + ", I'm bringing another group of CFOs together in " + esc(o.city) + " for a morning focused not just on the CFO role, but on where each of us is in our own CFO career and where we want to go next.") +
  p("We'll work together. Compare perspectives. Challenge some assumptions. And learn from the experience and judgment already sitting around the table.") +
  p("The goal is pretty simple: walk away with a different perspective on yourself, your career, and what becoming a better CFO might look like.") +
  p("No vendors. No CEOs. Just CFOs.") +
  p(esc(o.when_short) + "<br>" + esc(o.time_range) + "<br>" + esc(o.host_name) + ", " + esc(o.city) + "<br>Complimentary for qualified CFOs") +
  p("If you're a CFO in the Los Angeles area and you're curious about CFO Circle, come experience it for yourself.") +
  p("Request a seat: <a href=\"" + o.rsvp_url + "\" style=\"color:#121a3c;\">" + esc(o.rsvp_url) + "</a>") +
  p("Dalen Lawrence<br>Chapter Director, CFO Circle Los Angeles") +
  p(o.variant === "apollo" ? PS_APOLLO : PS_KNOWN) +
  '<div style="margin-top:28px;padding-top:14px;border-top:1px solid #dfe3ee;font-size:12px;line-height:1.6;color:#5a6280;">' +
  '<a href="' + o.unsub_url + '" style="color:#5a6280;text-decoration:underline;">Opt out with one click</a><br>CFO Circle Los Angeles &middot; ' + esc(FOOTER_ADDRESS) +
  "</div></div></body></html>"
}
