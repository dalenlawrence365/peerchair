// Shared by draft-email and draft-dm: pulls the active rows from the
// named_links self-service library (see /links page + named_links table
// comment) and formats them as a block for the drafting prompt, so Dalen's
// own labels ("CFO Circle Los Angeles", "Sept 16 Workshop RSVP") are
// available alongside the hardcoded SENDER_CONTEXT calendly links without
// needing a code change every time he wants to add or rename one.
//
// use_for is the field that actually does the matching work — the label is
// just the display text a reader sees, which usually has no relation to how
// Dalen describes the link out loud ("the web page," "the signup link"), so
// every row must carry a use_for description of when to reach for it. Same
// role as SENDER_CONTEXT.calendly_links.*.use_for in dalenContext.js.
export async function getNamedLinksLines(sb) {
  const { data } = await sb.from("named_links")
    .select("label, url, use_for")
    .eq("active", true)
    .order("label", { ascending: true })
  return (data || []).map(function (l) {
    return "- " + l.label + ": " + l.url + " — use when: " + l.use_for
  }).join("\n")
}


// Per-person, per-event TRACKED links for the drafting prompts (draft-dm and
// draft-email). The named_links library is generic by design — it can't know who
// the message is going to. This builds the link that makes a click attributable:
//   <site>/events/<slug>/?t=<this person's track token>&src=<channel>
// for every upcoming published event, soonest first, minting the person's token
// if they don't have one yet. `src` is the channel the message goes out on
// ("profile" = personal DM from Dalen, "email" = Outlook draft) so event
// attribution can tell a personal DM from a LinkedHelper blast ("li-dm").
export async function getPersonEventLinksLines(sb, personId, src) {
  if (!personId) return ""
  const SITE = process.env.NEXT_PUBLIC_EVENT_SITE_URL || "https://la-cfo.com"
  const today = new Date().toISOString().slice(0, 10)
  const { data: events } = await sb.from("events")
    .select("slug, name, event_date")
    .eq("published", true).gte("event_date", today)
    .order("event_date", { ascending: true })
  if (!events || !events.length) return ""

  let token = null
  const { data: existing } = await sb.from("track_tokens").select("token").eq("person_id", personId).limit(1).maybeSingle()
  if (existing) token = existing.token
  else {
    const { data: minted } = await sb.from("track_tokens").insert({ person_id: personId }).select("token").single()
    token = minted ? minted.token : null
  }
  if (!token) return ""

  return events.map(function (e, i) {
    let when = ""
    try { when = new Date(String(e.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) } catch (x) {}
    const url = SITE + "/events/" + e.slug + "/?t=" + encodeURIComponent(token) + "&src=" + encodeURIComponent(src || "profile")
    return "- " + (e.name || "CFO Circle workshop") + ", " + when + (i === 0 ? " (NEXT / LATEST UPCOMING EVENT — the default whenever the instructions say \"the workshop\", \"the event\", \"the next session\", or \"the invite\")" : "") + ": " + url
  }).join("\n")
}

export const PERSON_EVENT_LINK_RULE = "These are THIS recipient's personal, tracked event links — the token in the URL is how Dalen sees that they opened the page. Whenever the message invites them to, or mentions registering for, a workshop/event/session, use the matching link from this list EXACTLY as written (the full URL including ?t= and &src=). Never substitute a generic event URL from the other link lists, and never strip or edit the query string."
