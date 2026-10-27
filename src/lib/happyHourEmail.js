const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
const FOOTER_ADDRESS = "2549 Young Avenue #B, Thousand Oaks, CA 91360"
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

export const HAPPY_HOUR_SUBJECT = "A room full of CFOs. No one selling you anything."

/* Happy-hour (kind='happy_hour') template — Dalen's approved copy. Per-recipient tracked
   RSVP link + tracked invitation-list link + tokenized one-click unsubscribe. */
export function renderHappyHourHtml(o) {
  const btn = (href, label, solid) => solid
    ? '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#c39a4e" style="border-radius:3px;"><a href="' + href + '" style="display:inline-block;padding:15px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:3px;">' + label + '</a></td></tr></table>'
    : '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="border:2px solid #121a3c;border-radius:3px;"><a href="' + href + '" style="display:inline-block;padding:12px 26px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#121a3c;text-decoration:none;">' + label + '</a></td></tr></table>'
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#eef0f6;">' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef0f6;">' + esc(o.preheader) + '</div>' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;"><tr><td align="center" style="padding:24px 12px;">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:4px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">' +
  '<tr><td style="background:#121a3c;padding:18px 32px;"><img src="' + SITE + '/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" height="44" style="display:block;height:44px;width:auto;border:0;"></td></tr>' +
  '<tr><td style="padding:36px 32px 8px;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#c39a4e;">CFO Happy Hour &middot; Culver City</p>' +
  '<h1 style="margin:0;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;line-height:1.25;color:#121a3c;font-weight:bold;">A room full of CFOs. No one selling you anything.</h1></td></tr>' +
  '<tr><td style="padding:16px 32px 8px;font-size:16px;line-height:1.6;color:#2b3350;">' +
  '<p style="margin:0 0 16px;">On ' + esc(o.when_long) + ', I’m hosting a CFO Happy Hour in Culver City, with hospitality provided by Marsh Agency.</p>' +
  '<p style="margin:0 0 16px;">The idea is simple: an enjoyable evening with other people who sit in the CFO seat and understand the responsibilities, challenges, and opportunities that come with it. Sitting, fractional, or between roles &mdash; if you’re a CFO, you belong.</p>' +
  '<p style="margin:0 0 16px;">No presentations. No sales pitches. No formal agenda. Just good conversation and a few new acquaintances.</p></td></tr>' +
  '<tr><td style="padding:8px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;border-left:4px solid #c39a4e;"><tr><td style="padding:18px 22px;font-size:16px;line-height:1.5;color:#121a3c;">' +
  '<strong>' + esc(o.when_long) + '</strong><br>' + esc(o.time_line) + '<br>Culver City &middot; Complimentary<br>' +
  '<span style="font-size:14px;color:#5a6280;">A small room. I confirm each seat personally and share the venue once you’re in.</span></td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:26px 32px 6px;">' + btn(o.rsvp_url, 'Request your spot', true) + '</td></tr>' +
  '<tr><td style="padding:14px 32px 8px;font-size:16px;line-height:1.6;color:#2b3350;"><p style="margin:0 0 4px;">I’d enjoy having you join us.</p></td></tr>' +
  '<tr><td style="padding:10px 32px 28px;font-size:16px;line-height:1.5;color:#2b3350;"><strong style="color:#121a3c;">Dalen Lawrence</strong><br><span style="font-size:14px;color:#5a6280;">Chapter Director | CFO Circle Los Angeles</span></td></tr>' +
  '<tr><td style="padding:0 32px 24px;"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5a6280;">Hospitality by</p><img src="' + SITE + '/assets/marsh-agency-logo.png" alt="Marsh Agency" width="180" style="display:block;width:180px;height:auto;border:0;"></td></tr>' +
  '<tr><td style="padding:0 32px;"><div style="border-top:1px solid #dfe3ee;font-size:0;line-height:0;">&nbsp;</div></td></tr>' +
  '<tr><td style="padding:24px 32px 8px;"><h2 style="margin:0 0 10px;font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#121a3c;">Can’t make this one?</h2>' +
  '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2b3350;">I organize invitations to CFO gatherings throughout the year &mdash; workshops, happy hours, educational events, and the occasional sporting experience. If you’d like to hear about future ones, join my invitation list.</p></td></tr>' +
  '<tr><td style="padding:0 32px 8px;">' + btn(o.list_url, 'Join the invitation list', false) + '</td></tr>' +
  '<tr><td style="padding:12px 32px 30px;font-size:13px;line-height:1.5;color:#5a6280;">No newsletters. No pitches. Just occasional invitations to worthwhile CFO events.</td></tr>' +
  '<tr><td style="background:#121a3c;padding:18px 32px;font-size:12px;line-height:1.6;color:#c5cce4;">CFO Circle Los Angeles &mdash; a confidential peer forum for senior finance leaders.<br>' +
  'Not interested? <a href="' + o.unsub_url + '" style="color:#d8b779;text-decoration:underline;">Unsubscribe with one click</a>.<br>' + esc(FOOTER_ADDRESS) + '</td></tr>' +
  '</table></td></tr></table></body></html>'
}


export const WARM_SUBJECT = "Thursday, Nov 12 — CFO happy hour (I’d love to see you there)"

/* Warm-audience variant: people who already know Dalen (members, past attendees). */
export function renderWarmHappyHourHtml(o) {
  const name = String(o.first_name || "").trim()
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef0f6;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;"><tr><td align="center" style="padding:24px 12px;">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:4px;font-family:Arial,Helvetica,sans-serif;">' +
  '<tr><td style="background:#121a3c;padding:18px 32px;"><img src="' + SITE + '/cfo-circle-logo-white.png" alt="CFO Circle · Los Angeles" height="44" style="display:block;height:44px;width:auto;border:0;"></td></tr>' +
  '<tr><td style="padding:36px 32px 8px;"><p style="margin:0 0 10px;font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#c39a4e;">CFO Happy Hour &middot; Culver City</p>' +
  '<h1 style="margin:0;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;line-height:1.25;color:#121a3c;font-weight:bold;">A room full of CFOs. No one selling you anything.</h1></td></tr>' +
  '<tr><td style="padding:16px 32px 8px;font-size:16px;line-height:1.6;color:#2b3350;">' +
  '<p style="margin:0 0 16px;">' + (name ? 'Hi ' + esc(name) + ',' : 'Hi,') + '</p>' +
  '<p style="margin:0 0 16px;">On ' + esc(o.when_long) + ', I’m hosting a CFO Happy Hour in Culver City, with hospitality provided by Marsh Agency &mdash; and I’d love to see you there.</p>' +
  '<p style="margin:0 0 16px;">You’ve been part of this community, so I wanted you to hear about it directly from me. It’s the same idea as always: an enjoyable evening with people who sit in the CFO seat and understand the responsibilities, challenges, and opportunities that come with it.</p>' +
  '<p style="margin:0 0 16px;">No presentations. No sales pitches. No formal agenda. Just good conversation, a few new faces, and some you already know.</p></td></tr>' +
  '<tr><td style="padding:8px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;border-left:4px solid #c39a4e;"><tr><td style="padding:18px 22px;font-size:16px;line-height:1.5;color:#121a3c;">' +
  '<strong>' + esc(o.when_long) + '</strong><br>' + esc(o.time_line) + '<br>Culver City &middot; Complimentary<br>' +
  '<span style="font-size:14px;color:#5a6280;">I’m keeping the room small, so I’m holding a seat for you.</span></td></tr></table></td></tr>' +
  '<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#c39a4e" style="border-radius:3px;"><a href="' + o.rsvp_url + '" style="display:inline-block;padding:15px 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:3px;">Save my seat</a></td></tr></table></td></tr>' +
  '<tr><td style="padding:18px 32px 8px;font-size:16px;line-height:1.6;color:#2b3350;"><p style="margin:0 0 4px;">Can’t make this one? No problem &mdash; I’ll make sure you hear about the next.</p></td></tr>' +
  '<tr><td style="padding:10px 32px 24px;font-size:16px;line-height:1.5;color:#2b3350;">Hope to see you there,<br><strong style="color:#121a3c;">Dalen</strong><br><span style="font-size:14px;color:#5a6280;">Dalen Lawrence &middot; Chapter Director | CFO Circle Los Angeles</span></td></tr>' +
  '<tr><td style="padding:0 32px 30px;"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5a6280;">Hospitality by</p><img src="' + SITE + '/assets/marsh-agency-logo.png" alt="Marsh Agency" width="180" style="display:block;width:180px;height:auto;border:0;"></td></tr>' +
  '</table></td></tr></table></body></html>'
}
