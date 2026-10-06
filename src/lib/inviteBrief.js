// One-click "Invite to next workshop" for Draft DM / Draft Email.
//
// Builds the spoken-style INSTRUCTIONS Dalen would otherwise have to dictate, from
// what the app already knows about this person and the next upcoming event:
//   - which event (soonest published, event_date >= today)
//   - where they stand on it (Queued / Invited / Registered / Confirmed / ...) —
//     anything other than "not yet invited" or "Queued" comes back as a WARNING so a
//     draft doesn't double-invite someone who already said yes
//   - their history: a "can't make it" + the promise Dalen made, a prior attendance,
//     an earlier invite that never got a reply, or a clean first invite
// The text goes into the normal instructions box, so it is fully editable, and the
// existing draft routes then add the personal tracked link (see draftLinksContext).
// Nothing here sends, tags, or marks anyone invited.

function longDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "" }
}
function shortDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) } catch (e) { return "" }
}
function clock(iso) {
  try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(":00", "") } catch (e) { return "" }
}

export async function buildInviteBrief(sb, personId, channel) {
  const ch = channel === "email" ? "email" : "dm"
  const today = new Date().toISOString().slice(0, 10)

  const { data: ev } = await sb.from("events")
    .select("id, slug, name, event_date, ends_at, location, venue_name, host_name, summary, agenda, parking_instructions, breakfast_note")
    .eq("published", true).gte("event_date", today).order("event_date", { ascending: true }).limit(1).maybeSingle()
  if (!ev) return { ok: false, error: "no_upcoming_event" }

  const { data: person } = await sb.from("people")
    .select("first_name, full_name, linkedin_connected").eq("id", personId).maybeSingle()
  if (!person) return { ok: false, error: "person_not_found" }
  const first = person.first_name || (person.full_name || "them").split(" ")[0]

  const { data: rows } = await sb.from("event_attendees")
    .select("status, invited_at, unavailable_at, unavailable_note, event_id, events:event_id ( name, event_date )")
    .eq("person_id", personId)
  const mine = (rows || []).find(function (r) { return r.event_id === ev.id })
  const prior = (rows || []).filter(function (r) { return r.event_id !== ev.id })

  const { data: promise } = await sb.from("event_carry_forward")
    .select("reason, promised, created_at, events:from_event_id ( name, event_date )")
    .eq("person_id", personId).is("fulfilled_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle()

  const { data: replies } = await sb.from("person_action_tags")
    .select("notes, set_at").eq("person_id", personId).eq("action_type", "reply_received")
    .order("set_at", { ascending: false }).limit(1)

  // ---- warnings: where they already stand on THIS event ----
  const warnings = []
  const when = longDate(ev.event_date)
  if (mine) {
    const s = mine.status
    if (s === "Confirmed" || s === "Attended") warnings.push(first + " is already confirmed for " + when + ". An invite would be redundant.")
    else if (s === "Registered" || s === "Requested") warnings.push(first + " already registered for " + when + " and is waiting on your approval. Approve them on the roster instead of inviting.")
    else if (s === "Invited") warnings.push(first + " was already invited to " + when + (mine.invited_at ? " on " + shortDate(mine.invited_at) : "") + ". This would be a second message.")
    else if (s === "Declined") warnings.push(first + " declined " + when + ".")
    else if (s === "Unavailable") warnings.push(first + " already said they can't make " + when + ".")
  }
  if (ch === "dm" && !person.linkedin_connected) {
    warnings.push(first + " is not marked as a 1st-degree connection, so a LinkedIn DM may not be deliverable. Consider email or a connection request first.")
  }

  // ---- situation ----
  const unavail = prior.filter(function (r) { return r.status === "Unavailable" })
    .sort(function (a, b) { return String(b.unavailable_at || "").localeCompare(String(a.unavailable_at || "")) })[0]
  const attended = prior.filter(function (r) { return r.status === "Attended" })[0]
  const unanswered = prior.filter(function (r) { return r.status === "Invited" })[0]

  let situation = "first_invite"
  const lines = []
  const hrs = Math.round(((new Date(ev.ends_at) - new Date(ev.event_date)) / 3600000) * 2) / 2
  lines.push("Invite " + first + " to the CFO Circle workshop, \"" + (ev.name || "CFO Circle workshop") + ",\" on " + when + ", " + clock(ev.event_date) + " to " + clock(ev.ends_at) + " Pacific (" + hrs + " hours), in " + (ev.location || "Century City, Los Angeles") + (ev.host_name ? ", hosted by " + ev.host_name : "") + ".")

  if (promise || unavail) {
    situation = "reinvite_after_unavailable"
    const reason = (promise && promise.reason) || (unavail && unavail.unavailable_note) || ""
    const fromName = (promise && promise.events && promise.events.event_date) ? longDate(promise.events.event_date) : (unavail && unavail.events && unavail.events.event_date ? longDate(unavail.events.event_date) : "the last session")
    lines.push(first + " could not make the session on " + fromName + (reason ? ' and told me: "' + String(reason).trim().replace(/[.\s]+$/, "") + '"' : "") + ". This is a re-invite, not a cold one.")
    if (promise && promise.promised) lines.push('I promised them: "' + String(promise.promised).trim().replace(/[.\s]+$/, "") + '". Make good on that naturally, without sounding like a form letter.')
  } else if (attended) {
    situation = "returning_attendee"
    lines.push(first + " attended a previous session" + (attended.events && attended.events.event_date ? " (" + longDate(attended.events.event_date) + ")" : "") + ". Thank them for coming and invite them back. Don't re-explain what the workshop is.")
  } else if (unanswered) {
    situation = "followup_no_reply"
    lines.push(first + " was invited to an earlier session" + (unanswered.events && unanswered.events.event_date ? " (" + longDate(unanswered.events.event_date) + ")" : "") + " and never replied. Acknowledge that lightly and invite them to this one. No guilt.")
  } else if (replies && replies[0] && replies[0].notes) {
    lines.push('Their most recent reply to me was: "' + String(replies[0].notes).trim().slice(0, 240) + '". Pick up from there.')
  } else {
    lines.push("This is a first invitation. Keep it warm and low-pressure.")
  }

  const facts = []
  facts.push("complimentary, no cost to attend")
  facts.push("nothing is sold and there is no sales presentation")
  facts.push("a small, confidential, peer-to-peer working session of about 12 to 20 Los Angeles CFOs and senior finance leaders")
  if (ev.breakfast_note) facts.push("a light breakfast is served")
  if (ev.parking_instructions) facts.push("parking is validated")

  if (ch === "dm") {
    lines.push("This is a LinkedIn DM: short, 2 to 4 sentences, casual and personal. Include their personal event link on its own line. End with a simple ask, such as holding a seat for them.")
  } else {
    lines.push("This is an email, so give it room: 3 to 5 short paragraphs, not a wall of text.")
    lines.push("Cover: what the session is (" + (ev.summary || "a confidential, peer-to-peer working session built for the CFO seat") + "), who is in the room, the date, time and general location, and what to expect. Facts you may use: " + facts.join("; ") + ".")
    if (Array.isArray(ev.agenda) && ev.agenda.length) {
      lines.push("Optional one-line sense of the morning from this agenda: " + ev.agenda.map(function (a) { return a.time + " " + a.label }).join("; ") + ".")
    }
    lines.push("Ask them to reserve a seat using their personal event link, worded as a short clickable label. Offer to answer any questions. Write a specific subject line that includes the date. The session is " + hrs + " hours long; if you mention its length, use exactly that.")
  }
  lines.push("Use their personal event link for this event, exactly as given. Do not use any generic event URL.")

  return {
    ok: true,
    channel: ch,
    situation: situation,
    event: { slug: ev.slug, name: ev.name, date: ev.event_date },
    warnings: warnings,
    instructions: lines.join(" "),
  }
}
